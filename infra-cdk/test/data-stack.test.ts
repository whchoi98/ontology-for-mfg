// infra-cdk/test/data-stack.test.ts
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { NetworkStack } from '../lib/network-stack';
import { DataStack } from '../lib/data-stack';

describe('DataStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const env = { account: '111111111111', region: 'ap-northeast-2' };
    const network = new NetworkStack(app, 'TestNetwork', {
      env, projectName: 'ontology-mfg', envName: 'dev',
      retailVpcExportName: 'ontology-retail-dev-vpc-id',
      privateSubnetIds: ['subnet-priv1', 'subnet-priv2', 'subnet-priv3'],
      publicSubnetIds:  ['subnet-pub1',  'subnet-pub2',  'subnet-pub3'],
    });
    const data = new DataStack(app, 'TestData', {
      env, projectName: 'ontology-mfg', envName: 'dev',
      vpc: network.vpc, neptuneSg: network.neptuneSg, auroraSg: network.auroraSg,
    });
    template = Template.fromStack(data);
  });

  test('5 KMS keys', () => {
    template.resourceCountIs('AWS::KMS::Key', 5);
  });

  test('Neptune cluster (serverless v2)', () => {
    template.resourceCountIs('AWS::Neptune::DBCluster', 1);
  });

  test('Aurora serverless v2 cluster', () => {
    template.hasResourceProperties('AWS::RDS::DBCluster', {
      Engine: 'aurora-postgresql',
      ServerlessV2ScalingConfiguration: Match.anyValue(),
    });
  });

  test('OpenSearch Serverless collection', () => {
    template.hasResourceProperties('AWS::OpenSearchServerless::Collection', {
      Type: 'VECTORSEARCH',
    });
  });

  test('4 S3 buckets', () => {
    template.resourceCountIs('AWS::S3::Bucket', 4);
  });
});
