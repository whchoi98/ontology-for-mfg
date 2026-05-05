import { Stack, StackProps, CfnOutput, Fn, Tags } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export interface NetworkStackProps extends StackProps {
  projectName: string;
  envName: string;
  /** CloudFormation export name from retail's network stack carrying the VPC ID. */
  retailVpcExportName: string;
  /** Optional explicit VPC ID (overrides export, useful for tests). */
  vpcIdOverride?: string;
  /** AWS-managed prefix list for CloudFront origin-facing IPs. */
  cloudfrontOriginPrefixListId?: string;
  /** Optional private subnet IDs (for test contexts where the VPC is a stub). */
  privateSubnetIds?: string[];
  /** Optional public subnet IDs (for test contexts where the VPC is a stub). */
  publicSubnetIds?: string[];
}

/**
 * NetworkStack imports retail's VPC (no new VPC created) and provisions only
 * the mfg-prefixed security groups used by ALB / ECS / Aurora / Neptune.
 *
 * Spec § D.2 — VPC sharing: same 10.20.0.0/16, same subnets, same NAT.
 * Retail SGs are NOT modified. retail's `vpce-sg` permits VPC CIDR so mfg ENIs
 * automatically reach the existing VPC Endpoints.
 */
export class NetworkStack extends Stack {
  public readonly vpc: ec2.IVpc;
  public readonly albSg: ec2.SecurityGroup;
  public readonly webSg: ec2.SecurityGroup;
  public readonly apiSg: ec2.SecurityGroup;
  public readonly auroraSg: ec2.SecurityGroup;
  public readonly neptuneSg: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);

    const { projectName, envName, retailVpcExportName, vpcIdOverride } = props;
    const cfPrefixListId = props.cloudfrontOriginPrefixListId ?? 'pl-22a6434b';

    const vpcId = vpcIdOverride ?? Fn.importValue(retailVpcExportName);
    this.vpc = ec2.Vpc.fromVpcAttributes(this, 'RetailVpc', {
      vpcId,
      availabilityZones: props.privateSubnetIds
        ? ['ap-northeast-2a', 'ap-northeast-2b', 'ap-northeast-2c']
        : Fn.getAzs(),
      // Subnets are discovered at deploy time via Vpc.fromLookup in production;
      // for synth we accept that subnet IDs are not statically required by SG creation.
      ...(props.privateSubnetIds ? { privateSubnetIds: props.privateSubnetIds } : {}),
      ...(props.publicSubnetIds  ? { publicSubnetIds:  props.publicSubnetIds  } : {}),
    });

    this.albSg = new ec2.SecurityGroup(this, 'MfgAlbSg', {
      vpc: this.vpc,
      description: 'mfg-alb-sg: CloudFront origin-facing prefix list ingress',
      allowAllOutbound: true,
    });
    this.albSg.addIngressRule(
      ec2.Peer.prefixList(cfPrefixListId),
      ec2.Port.tcp(80),
      'CloudFront → ALB :80',
    );

    this.webSg = new ec2.SecurityGroup(this, 'MfgWebSg', {
      vpc: this.vpc,
      description: 'mfg-web-sg: Next.js Fargate :3000',
      allowAllOutbound: true,
    });
    this.webSg.addIngressRule(this.albSg, ec2.Port.tcp(3000), 'ALB → web :3000');

    this.apiSg = new ec2.SecurityGroup(this, 'MfgApiSg', {
      vpc: this.vpc,
      description: 'mfg-api-sg: FastAPI Fargate :8000',
      allowAllOutbound: true,
    });
    this.apiSg.addIngressRule(this.albSg, ec2.Port.tcp(8000), 'ALB → api :8000');

    this.auroraSg = new ec2.SecurityGroup(this, 'MfgAuroraSg', {
      vpc: this.vpc,
      description: 'mfg-aurora-sg: api → Aurora :5432',
      allowAllOutbound: true,
    });
    this.auroraSg.addIngressRule(this.apiSg, ec2.Port.tcp(5432), 'api → Aurora');

    this.neptuneSg = new ec2.SecurityGroup(this, 'MfgNeptuneSg', {
      vpc: this.vpc,
      description: 'mfg-neptune-sg: api → Neptune :8182',
      allowAllOutbound: true,
    });
    this.neptuneSg.addIngressRule(this.apiSg, ec2.Port.tcp(8182), 'api → Neptune Gremlin');

    Tags.of(this).add('Project', projectName);
    Tags.of(this).add('Env', envName);

    new CfnOutput(this, 'MfgApiSgId',     { value: this.apiSg.securityGroupId,     exportName: `${projectName}-${envName}-api-sg-id` });
    new CfnOutput(this, 'MfgAlbSgId',     { value: this.albSg.securityGroupId,     exportName: `${projectName}-${envName}-alb-sg-id` });
    new CfnOutput(this, 'MfgWebSgId',     { value: this.webSg.securityGroupId,     exportName: `${projectName}-${envName}-web-sg-id` });
    new CfnOutput(this, 'MfgAuroraSgId',  { value: this.auroraSg.securityGroupId,  exportName: `${projectName}-${envName}-aurora-sg-id` });
    new CfnOutput(this, 'MfgNeptuneSgId', { value: this.neptuneSg.securityGroupId, exportName: `${projectName}-${envName}-neptune-sg-id` });
  }
}
