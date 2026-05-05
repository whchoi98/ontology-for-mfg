// infra-cdk/test/edge-stack.test.ts
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { EdgeStack } from '../lib/edge-stack';

describe('EdgeStack', () => {
  let template: Template;
  beforeAll(() => {
    const app = new cdk.App();
    const stack = new EdgeStack(app, 'TestEdge', {
      env: { account: '111111111111', region: 'us-east-1' },  // EdgeStack runs in us-east-1
      projectName: 'ontology-mfg',
      envName: 'dev',
      albDnsName: 'mfg-dev-alb-1234.elb.amazonaws.com',
      domainName: 'mfg-ontology.whchoi.net',
      hostedZoneName: 'whchoi.net',
    });
    template = Template.fromStack(stack);
  });

  test('Cognito user pool with self-signup off', () => {
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      AdminCreateUserConfig: { AllowAdminCreateUserOnly: true },
    });
  });

  test('two seed users (admin + demo)', () => {
    template.resourceCountIs('AWS::Cognito::UserPoolUser', 2);
  });

  test('6 user-pool groups', () => {
    template.resourceCountIs('AWS::Cognito::UserPoolGroup', 6);
  });

  test('CloudFront distribution', () => {
    template.resourceCountIs('AWS::CloudFront::Distribution', 1);
  });

  test('Lambda@Edge function (viewer-request)', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Handler: 'index.handler',
    });
  });
});
