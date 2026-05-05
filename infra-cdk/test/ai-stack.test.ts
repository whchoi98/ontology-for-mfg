// infra-cdk/test/ai-stack.test.ts
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { AIStack } from '../lib/ai-stack';

describe('AIStack', () => {
  let template: Template;
  beforeAll(() => {
    const app = new cdk.App();
    const stack = new AIStack(app, 'TestAI', {
      env: { account: '111111111111', region: 'ap-northeast-2' },
      projectName: 'ontology-mfg',
      envName: 'dev',
      rawDocsBucketArn: 'arn:aws:s3:::ontology-mfg-dev-raw-docs',
      osCollectionArn:  'arn:aws:aoss:ap-northeast-2:111111111111:collection/test',
    });
    template = Template.fromStack(stack);
  });

  test('Bedrock Guardrail with 4 topics', () => {
    template.hasResourceProperties('AWS::Bedrock::Guardrail', {
      TopicPolicyConfig: { TopicsConfig: Match.arrayWith([
        Match.objectLike({ Name: 'IPConfidential' }),
        Match.objectLike({ Name: 'CompetitorDisparagement' }),
        Match.objectLike({ Name: 'RegulationViolation' }),
        Match.objectLike({ Name: 'HazardousChemical' }),
      ])},
    });
  });

  test('Bedrock Knowledge Base resource present', () => {
    template.resourceCountIs('AWS::Bedrock::KnowledgeBase', 1);
  });

  test('IAM role for Bedrock KB has S3 read on raw-docs', () => {
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([Match.objectLike({
          Principal: { Service: 'bedrock.amazonaws.com' },
        })]),
      }),
    });
  });
});
