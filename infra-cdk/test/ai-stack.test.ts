// infra-cdk/test/ai-stack.test.ts
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { AIStack } from '../lib/ai-stack';

describe('AIStack', () => {
  let template: Template;
  let stack: AIStack;
  beforeAll(() => {
    const app = new cdk.App();
    stack = new AIStack(app, 'TestAI', {
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

  // CLASSIC tier supports only English/French/Spanish; demo prompts are Korean.
  test('Guardrail uses the STANDARD tier through the APAC guardrail profile', () => {
    template.hasResourceProperties('AWS::Bedrock::Guardrail', {
      CrossRegionConfig: {
        GuardrailProfileArn: 'arn:aws:bedrock:ap-northeast-2:111111111111:guardrail-profile/apac.guardrail.v1:0',
      },
      TopicPolicyConfig: Match.objectLike({ TopicsTierConfig: { TierName: 'STANDARD' } }),
      ContentPolicyConfig: Match.objectLike({ ContentFiltersTierConfig: { TierName: 'STANDARD' } }),
    });
  });

  // Measured trade-off (ai-stack.ts header, scripts/guardrail_probe.py): blocking these two
  // topics, or MISCONDUCT on input above LOW, stopped ordinary REACH/RoHS/CBAM questions.
  test('Guardrail blocks leaks/disparagement, only monitors regulation/chemical topics', () => {
    const g = Object.values(template.findResources('AWS::Bedrock::Guardrail'))[0] as any;
    const topics = Object.fromEntries(g.Properties.TopicPolicyConfig.TopicsConfig.map(
      (t: any) => [t.Name, `${t.InputAction}/${t.OutputAction}`]));
    expect(topics).toEqual({
      IPConfidential: 'BLOCK/BLOCK',
      CompetitorDisparagement: 'BLOCK/BLOCK',
      RegulationViolation: 'NONE/NONE',
      HazardousChemical: 'NONE/NONE',
    });
    const misconduct = g.Properties.ContentPolicyConfig.FiltersConfig.find((f: any) => f.Type === 'MISCONDUCT');
    expect([misconduct.InputStrength, misconduct.OutputStrength]).toEqual(['LOW', 'HIGH']);
  });

  // KB is created post-deploy: CfnKnowledgeBase needs the AOSS vector index to
  // exist first, and CloudFormation cannot create AOSS indexes (commit 878bbe0).
  test('Bedrock Knowledge Base is deferred to post-deploy', () => {
    template.resourceCountIs('AWS::Bedrock::KnowledgeBase', 0);
    expect(stack.knowledgeBaseId).toBe('pending-post-deploy');
  });

  test('AOSS data access policy covers the KB, loader and API task roles', () => {
    template.hasResourceProperties('AWS::OpenSearchServerless::AccessPolicy', {
      Name: 'ontology-mfg-dev-os-access',
      Type: 'data',
    });
    const policy = JSON.stringify(
      Object.values(template.findResources('AWS::OpenSearchServerless::AccessPolicy'))[0]);
    expect(policy).toContain('role/ontology-mfg-dev-loader-task-role');
    expect(policy).toContain('role/ontology-mfg-dev-ecs-task-role-api');
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
