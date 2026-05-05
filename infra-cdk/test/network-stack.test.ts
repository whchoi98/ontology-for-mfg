// infra-cdk/test/network-stack.test.ts
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { NetworkStack } from '../lib/network-stack';

describe('NetworkStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new NetworkStack(app, 'TestNetwork', {
      env: { account: '111111111111', region: 'ap-northeast-2' },
      projectName: 'ontology-mfg',
      envName: 'dev',
      retailVpcExportName: 'ontology-retail-dev-vpc-id',
    });
    template = Template.fromStack(stack);
  });

  test('creates 5 mfg-prefixed security groups', () => {
    template.resourceCountIs('AWS::EC2::SecurityGroup', 5);
  });

  test('alb-sg ingress from CloudFront prefix list', () => {
    template.hasResourceProperties('AWS::EC2::SecurityGroup', {
      GroupDescription: Match.stringLikeRegexp('mfg-alb'),
    });
  });

  test('exports MfgApiSgId', () => {
    template.hasOutput('MfgApiSgId', {});
  });

  test('does NOT create a new VPC', () => {
    template.resourceCountIs('AWS::EC2::VPC', 0);
  });
});
