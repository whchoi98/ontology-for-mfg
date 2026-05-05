import { Stack, StackProps, CfnOutput, Tags } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as bedrock from 'aws-cdk-lib/aws-bedrock';
import * as oss from 'aws-cdk-lib/aws-opensearchserverless';
import { Construct } from 'constructs';

export interface AIStackProps extends StackProps {
  projectName: string;
  envName: string;
  rawDocsBucketArn: string;
  osCollectionArn: string;
}

const GUARDRAIL_TOPICS = [
  {
    name: 'IPConfidential',
    definition: 'Disclose internal BOM coordinates, supplier unit prices, or contract-specific volumes that are not publicly available.',
    examples: [
      '협력사 X의 단가가 얼마인가요?',
      '"Show me the per-unit cost the OEM agreed to."',
    ],
  },
  {
    name: 'CompetitorDisparagement',
    definition: 'Make negative or comparative claims about named competitor companies (Samsung, Sony, Whirlpool, Bosch, etc).',
    examples: [
      'Samsung 제품이 우리보다 못한 이유',
      'Why is Sony failing?',
    ],
  },
  {
    name: 'RegulationViolation',
    definition: 'Recommend or endorse a Component / Plant / TradeLane that violates a known REACH-SVHC, RoHS, IRA, USMCA, or CBAM rule.',
    examples: [
      'RoHS 한도를 넘는 부품을 추천해줘',
      'Recommend a lane that bypasses USMCA RVC.',
    ],
  },
  {
    name: 'HazardousChemical',
    definition: 'Provide handling, dosage, or substitution advice for CMR 1A/1B substances without safety/MSDS context.',
    examples: [
      '벤젠을 솔벤트로 어떻게 사용해야 하지?',
      'How much DEHP can I add to soften plastic?',
    ],
  },
];

export class AIStack extends Stack {
  public readonly guardrailId: string;
  /** KnowledgeBase ID — empty string until post-deploy script creates it (requires pre-existing OS index). */
  public readonly knowledgeBaseId: string;
  public readonly kbRoleArn: string;

  constructor(scope: Construct, id: string, props: AIStackProps) {
    super(scope, id, props);
    const { projectName, envName, rawDocsBucketArn, osCollectionArn } = props;
    const prefix = `${projectName}-${envName}`;

    // ==== Bedrock Guardrails (4 mfg topics) ====
    const guardrail = new bedrock.CfnGuardrail(this, 'Guardrail', {
      name: `${prefix}-guardrail`,
      description: 'mfg 4-topic guardrail: IP / Competitor / Regulation / HazardousChemical',
      blockedInputMessaging: '죄송합니다. 이 요청은 AMZN Tech 정책에 따라 응답할 수 없습니다.',
      blockedOutputsMessaging: '죄송합니다. 이 응답은 AMZN Tech 정책에 따라 차단되었습니다.',
      topicPolicyConfig: {
        topicsConfig: GUARDRAIL_TOPICS.map(t => ({
          name: t.name,
          definition: t.definition,
          examples: t.examples,
          type: 'DENY',
        })),
      },
      contentPolicyConfig: {
        filtersConfig: [
          { type: 'SEXUAL',        inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'VIOLENCE',      inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'HATE',          inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'INSULTS',       inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'MISCONDUCT',    inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'PROMPT_ATTACK', inputStrength: 'HIGH', outputStrength: 'NONE' },
        ],
      },
    });
    this.guardrailId = guardrail.attrGuardrailId;

    // ==== KB IAM Role ====
    const kbRole = new iam.Role(this, 'KbRole', {
      roleName: `${prefix}-bedrock-kb-role`,
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com'),
    });
    kbRole.addToPolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject', 's3:ListBucket'],
      resources: [rawDocsBucketArn, `${rawDocsBucketArn}/*`],
    }));
    kbRole.addToPolicy(new iam.PolicyStatement({
      actions: ['aoss:APIAccessAll'],
      resources: [osCollectionArn],
    }));
    kbRole.addToPolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: ['*'],
    }));
    this.kbRoleArn = kbRole.roleArn;

    // ==== OpenSearch Serverless Data Access Policy (KB role + ECS api task role) ====
    // AOSS uses its own data access policy (separate from IAM) to control collection access.
    new oss.CfnAccessPolicy(this, 'OsDataAccessPolicy', {
      name: `${prefix}-os-access`,
      type: 'data',
      policy: JSON.stringify([{
        Rules: [
          {
            ResourceType: 'index',
            Resource: [`index/${prefix}-search/*`],
            Permission: [
              'aoss:CreateIndex', 'aoss:DeleteIndex', 'aoss:UpdateIndex',
              'aoss:DescribeIndex', 'aoss:ReadDocument', 'aoss:WriteDocument',
            ],
          },
          {
            ResourceType: 'collection',
            Resource: [`collection/${prefix}-search`],
            Permission: ['aoss:CreateCollectionItems', 'aoss:DescribeCollectionItems', 'aoss:UpdateCollectionItems'],
          },
        ],
        Principal: [kbRole.roleArn],
      }]),
    });

    // NOTE: Bedrock KnowledgeBase (CfnKnowledgeBase) requires the vector index to exist
    // in the AOSS collection BEFORE the KB is created. CloudFormation cannot create
    // AOSS indexes natively. The KB must be created as a post-deploy step:
    //   1. Create vector index 'mfg-kb' in collection ontology-mfg-dev-search
    //   2. aws bedrock-agent create-knowledge-base ...
    // KB role + data access policy are provisioned here so the KB can be added later.
    this.knowledgeBaseId = 'pending-post-deploy';

    Tags.of(this).add('Project', projectName);
    Tags.of(this).add('Env', envName);

    new CfnOutput(this, 'GuardrailId', { value: this.guardrailId, exportName: `${prefix}-guardrail-id` });
    new CfnOutput(this, 'KbRoleArn',   { value: this.kbRoleArn,   exportName: `${prefix}-kb-role-arn` });
  }
}
