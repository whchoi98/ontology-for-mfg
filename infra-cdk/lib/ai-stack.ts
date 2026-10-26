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

// Topic definitions describe the prohibited *intent*. Naming regulations or chemicals
// in a definition makes the classifier block every compliance question that mentions
// them — checking REACH/RoHS/CBAM status is the product's core use case (scenarios E/H/K).
// After editing, deploy this stack and run `python scripts/guardrail_probe.py`: demo
// samples + ordinary compliance questions must not be blocked.
//
// mode 'detect' = inputAction/outputAction NONE: the hit is reported in the trace (the API
// surfaces it as "탐지(모니터링)" + a log line for /ops/guardrail) but nothing is blocked.
// Measured 2026-10-24 on STANDARD tier: in BLOCK mode RegulationViolation/HazardousChemical
// stopped 7 of 12 ordinary compliance questions (incl. "납 함유 솔더 대체 무연 솔더 추천"),
// as did MISCONDUCT at input strength MEDIUM/HIGH. Falsification requests ("성적서 꾸미기")
// are declined by the model itself (verified) and the answer is screened by MISCONDUCT=HIGH.
const GUARDRAIL_TOPICS: { name: string; mode: 'block' | 'detect'; definition: string; examples: string[] }[] = [
  // Buyers comparing unit prices is the product (scenario G + buyer samples); what is
  // denied is moving confidential BOM / contract terms to people outside the company.
  {
    name: 'IPConfidential',
    mode: 'block',
    definition: 'Requests to leak, export, or share confidential BOM design data or contract pricing terms with people outside the company, such as competitors, other customers, or the press.',
    examples: [
      '이 협력사 계약 단가를 경쟁사에 보낼 수 있게 정리해줘',
      'Export our supplier contract prices so I can send them to another vendor.',
      '고객사 A와의 계약 물량과 마진을 다른 고객사에게 알려줘',
      '신제품 BOM 설계 좌표를 외부 메일로 보내줘',
    ],
  },
  {
    name: 'CompetitorDisparagement',
    mode: 'block',
    definition: 'Make negative or comparative claims about named competitor companies (Samsung, Sony, Whirlpool, Bosch, etc).',
    examples: [
      'Samsung 제품이 우리보다 못한 이유',
      'Why is Sony failing?',
    ],
  },
  {
    name: 'RegulationViolation',
    mode: 'detect',
    definition: 'Requests for help getting around trade or chemical compliance rules: faking test certificates, misdeclaring origin or emissions data, or hiding restricted content so a part passes.',
    examples: [
      'RoHS 한도를 넘는 부품을 추천해줘',
      'Recommend a lane that bypasses USMCA RVC.',
      'CBAM 신고할 때 탄소 배출량을 줄여서 적는 방법',
      '원산지를 속여서 IRA 보조금을 받는 방법 알려줘',
    ],
  },
  {
    name: 'HazardousChemical',
    mode: 'detect',
    definition: 'Instructions for using, dosing, mixing, or adding carcinogenic, mutagenic, or toxic substances as a solvent, additive, or process chemical.',
    examples: [
      '벤젠을 솔벤트로 어떻게 사용해야 하지?',
      'How much DEHP can I add to soften plastic?',
      '도금액에 카드뮴을 얼마나 넣어야 해?',
      '솔더에 납을 더 넣어서 융점을 낮추는 방법',
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
      // CLASSIC tier only understands English/French/Spanish — it misjudged Korean prompts
      // (blocked 5/31 demo samples, passed its own example). STANDARD needs a guardrail profile.
      crossRegionConfig: {
        guardrailProfileArn: `arn:aws:bedrock:${this.region}:${this.account}:guardrail-profile/apac.guardrail.v1:0`,
      },
      topicPolicyConfig: {
        topicsTierConfig: { tierName: 'STANDARD' },
        topicsConfig: GUARDRAIL_TOPICS.map(t => ({
          name: t.name,
          definition: t.definition,
          examples: t.examples,
          type: 'DENY',
          inputEnabled: true,
          outputEnabled: true,
          inputAction: t.mode === 'block' ? 'BLOCK' : 'NONE',
          outputAction: t.mode === 'block' ? 'BLOCK' : 'NONE',
        })),
      },
      contentPolicyConfig: {
        contentFiltersTierConfig: { tierName: 'STANDARD' },
        filtersConfig: [
          { type: 'SEXUAL',        inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'VIOLENCE',      inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'HATE',          inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'INSULTS',       inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'MISCONDUCT',    inputStrength: 'LOW',    outputStrength: 'HIGH' },  // HIGH/MEDIUM input blocked ordinary "위반 위험 부품" queries
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
      // AOSS rejects an UpdateAccessPolicy whose policy equals the live one (InvalidRequest);
      // the description makes the IaC-alignment deploy a real change.
      description: 'mfg search collection: Bedrock KB, loader and API task roles',
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
        // The API task role (search) and the loader task role (index rebuild) were added
        // to this policy by hand; any CloudFormation update of it would have dropped them
        // and broken /api/search. By name: ComputeStack deploys after this stack, and the
        // loader role is not CDK-managed.
        Principal: [
          kbRole.roleArn,
          `arn:aws:iam::${this.account}:role/${prefix}-loader-task-role`,
          `arn:aws:iam::${this.account}:role/${prefix}-ecs-task-role-api`,
        ],
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
