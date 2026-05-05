import { Stack, StackProps, RemovalPolicy, CfnOutput, Tags } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as neptune from 'aws-cdk-lib/aws-neptune';
import * as oss from 'aws-cdk-lib/aws-opensearchserverless';
import { Construct } from 'constructs';

export interface DataStackProps extends StackProps {
  projectName: string;
  envName: string;
  vpc: ec2.IVpc;
  neptuneSg: ec2.SecurityGroup;
  auroraSg: ec2.SecurityGroup;
}

export class DataStack extends Stack {
  public readonly neptuneEndpoint: string;
  public readonly auroraSecretArn: string;
  public readonly osCollectionEndpoint: string;
  public readonly buckets: { rawDocs: s3.Bucket; synthetic: s3.Bucket; snapshots: s3.Bucket; uploads: s3.Bucket };

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);
    const { projectName, envName, vpc, neptuneSg, auroraSg } = props;
    const prefix = `${projectName}-${envName}`;

    // ==== KMS x5 ====
    const keyS3      = new kms.Key(this, 'S3Key',      { alias: `${prefix}-s3-key`,      enableKeyRotation: true });
    const keyAurora  = new kms.Key(this, 'AuroraKey',  { alias: `${prefix}-aurora-key`,  enableKeyRotation: true });
    const keyNeptune = new kms.Key(this, 'NeptuneKey', { alias: `${prefix}-neptune-key`, enableKeyRotation: true });
    const keyOs      = new kms.Key(this, 'OsKey',      { alias: `${prefix}-os-key`,      enableKeyRotation: true });
    new kms.Key(this, 'LogsKey',    { alias: `${prefix}-logs-key`,    enableKeyRotation: true });

    // ==== S3 (4 buckets) ====
    const mkBucket = (logicalId: string, suffix: string) =>
      new s3.Bucket(this, logicalId, {
        bucketName: `${prefix}-${suffix}`,
        encryption: s3.BucketEncryption.KMS,
        encryptionKey: keyS3,
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        enforceSSL: true,
        removalPolicy: RemovalPolicy.DESTROY,  // demo env
        autoDeleteObjects: true,
        versioned: false,
      });
    const rawDocs   = mkBucket('RawDocsBucket',   'raw-docs');
    const synthetic = mkBucket('SyntheticBucket', 'synthetic');
    const snapshots = mkBucket('SnapshotsBucket', 'ontology-snapshots');
    const uploads   = mkBucket('UploadsBucket',   'uploads');
    this.buckets = { rawDocs, synthetic, snapshots, uploads };

    // ==== Neptune Serverless (2 NCU baseline) ====
    const neptuneSubnetGroup = new neptune.CfnDBSubnetGroup(this, 'NeptuneSubnetGroup', {
      dbSubnetGroupName: `${prefix}-neptune-sg-grp`,
      dbSubnetGroupDescription: 'mfg Neptune subnet group (retail VPC private subnets)',
      subnetIds: vpc.privateSubnets.map(s => s.subnetId),
    });
    const neptuneCluster = new neptune.CfnDBCluster(this, 'NeptuneCluster', {
      dbClusterIdentifier: `${prefix}-neptune`,
      dbSubnetGroupName: neptuneSubnetGroup.ref,
      vpcSecurityGroupIds: [neptuneSg.securityGroupId],
      kmsKeyId: keyNeptune.keyArn,
      storageEncrypted: true,
      iamAuthEnabled: true,
      serverlessScalingConfiguration: { minCapacity: 1, maxCapacity: 8 },
      engineVersion: '1.3.2.0',
    });
    new neptune.CfnDBInstance(this, 'NeptuneInstance', {
      dbClusterIdentifier: neptuneCluster.ref,
      dbInstanceClass: 'db.serverless',
      dbInstanceIdentifier: `${prefix}-neptune-1`,
    });
    this.neptuneEndpoint = neptuneCluster.attrEndpoint;

    // ==== Aurora PostgreSQL Serverless v2 ====
    const auroraCluster = new rds.DatabaseCluster(this, 'AuroraCluster', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({ version: rds.AuroraPostgresEngineVersion.VER_15_5 }),
      vpc, securityGroups: [auroraSg],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      writer: rds.ClusterInstance.serverlessV2('Writer', { autoMinorVersionUpgrade: true }),
      serverlessV2MinCapacity: 0.5,
      serverlessV2MaxCapacity: 2,
      storageEncryptionKey: keyAurora,
      removalPolicy: RemovalPolicy.DESTROY,
      defaultDatabaseName: 'mfg',
      credentials: rds.Credentials.fromGeneratedSecret('mfg_admin', {
        secretName: `${prefix}-aurora-master`,
      }),
    });
    this.auroraSecretArn = auroraCluster.secret!.secretArn;

    // ==== OpenSearch Serverless (vector + nori) ====
    const osCollection = new oss.CfnCollection(this, 'OsCollection', {
      name: `${prefix}-search`,
      type: 'VECTORSEARCH',
      description: 'mfg hybrid Nori BM25 + KNN + Telemetry timeseries',
    });
    new oss.CfnSecurityPolicy(this, 'OsEncryptionPolicy', {
      name: `${prefix}-os-enc`,
      type: 'encryption',
      policy: JSON.stringify({
        Rules: [{ ResourceType: 'collection', Resource: [`collection/${prefix}-search`] }],
        AWSOwnedKey: false,
        KmsARN: keyOs.keyArn,
      }),
    });
    new oss.CfnSecurityPolicy(this, 'OsNetworkPolicy', {
      name: `${prefix}-os-net`,
      type: 'network',
      policy: JSON.stringify([{
        Rules: [{ ResourceType: 'collection', Resource: [`collection/${prefix}-search`] }],
        AllowFromPublic: false,
        SourceVPCEs: [],  // VPC endpoint added in deploy step
      }]),
    });
    this.osCollectionEndpoint = osCollection.attrCollectionEndpoint;

    Tags.of(this).add('Project', projectName);
    Tags.of(this).add('Env', envName);

    new CfnOutput(this, 'NeptuneEndpoint',      { value: this.neptuneEndpoint,      exportName: `${prefix}-neptune-endpoint` });
    new CfnOutput(this, 'AuroraSecretArn',      { value: this.auroraSecretArn,      exportName: `${prefix}-aurora-secret-arn` });
    new CfnOutput(this, 'OsCollectionEndpoint', { value: this.osCollectionEndpoint, exportName: `${prefix}-os-endpoint` });
    new CfnOutput(this, 'RawDocsBucketName',    { value: rawDocs.bucketName,        exportName: `${prefix}-raw-docs-bucket` });
    new CfnOutput(this, 'UploadsBucketName',    { value: uploads.bucketName,        exportName: `${prefix}-uploads-bucket` });
    new CfnOutput(this, 'OsCollectionArn',      { value: osCollection.attrArn,      exportName: `${prefix}-os-collection-arn` });
  }
}
