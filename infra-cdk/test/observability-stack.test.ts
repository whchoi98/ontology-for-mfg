// infra-cdk/test/observability-stack.test.ts
import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { ObservabilityStack } from '../lib/observability-stack';

describe('ObservabilityStack', () => {
  let template: Template;
  beforeAll(() => {
    const app = new cdk.App();
    const stack = new ObservabilityStack(app, 'TestObs', {
      env: { account: '111111111111', region: 'ap-northeast-2' },
      projectName: 'ontology-mfg', envName: 'dev',
      clusterName: 'ontology-mfg-dev-cluster',
      apiServiceName: 'ontology-mfg-dev-api',
      webServiceName: 'ontology-mfg-dev-web',
    });
    template = Template.fromStack(stack);
  });

  test('Dashboard "MFG Demo Health"', () => {
    template.resourceCountIs('AWS::CloudWatch::Dashboard', 1);
  });

  test('5 CW alarms', () => {
    template.resourceCountIs('AWS::CloudWatch::Alarm', 5);
  });
});
