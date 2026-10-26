// infra-cdk/test/compute-stack.test.ts
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { NetworkStack } from '../lib/network-stack';
import { ComputeStack } from '../lib/compute-stack';

describe('ComputeStack', () => {
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
    const compute = new ComputeStack(app, 'TestCompute', {
      env, projectName: 'ontology-mfg', envName: 'dev',
      vpc: network.vpc, albSg: network.albSg, webSg: network.webSg, apiSg: network.apiSg,
    });
    template = Template.fromStack(compute);
  });

  test('2 ECR repos', () => {
    template.resourceCountIs('AWS::ECR::Repository', 2);
  });

  // Release tags are immutable git SHAs (scripts/deploy.sh); `latest` can no longer be
  // moved under a running service.
  test('ECR tags are immutable and old builds expire', () => {
    const repos = Object.values(template.findResources('AWS::ECR::Repository')) as any[];
    for (const repo of repos) {
      expect(repo.Properties.ImageTagMutability).toBe('IMMUTABLE');
      const rules = JSON.parse(repo.Properties.LifecyclePolicy.LifecyclePolicyText).rules;
      expect(rules.map((r: any) => r.selection.tagStatus)).toEqual(['untagged', 'any']);
    }
  });

  test('task definitions take their image tag from SSM, never :latest', () => {
    const params = template.toJSON().Parameters ?? {};
    const ssmDefaults = Object.values(params)
      .filter((p: any) => p.Type === 'AWS::SSM::Parameter::Value<String>')
      .map((p: any) => p.Default);
    expect(ssmDefaults).toEqual(expect.arrayContaining([
      '/ontology-mfg-dev/image-tag/api', '/ontology-mfg-dev/image-tag/web',
    ]));
    const taskDefs = Object.values(template.findResources('AWS::ECS::TaskDefinition'));
    expect(taskDefs).toHaveLength(2);
    for (const td of taskDefs) {
      const image = JSON.stringify((td as any).Properties.ContainerDefinitions[0].Image);
      expect(image).not.toContain(':latest');
      expect(image).toMatch(/SsmParameterValue.*imagetag/i);
    }
  });

  test('services roll back a failed deployment', () => {
    const services = Object.values(template.findResources('AWS::ECS::Service')) as any[];
    expect(services).toHaveLength(2);
    for (const svc of services) {
      expect(svc.Properties.DeploymentConfiguration.DeploymentCircuitBreaker)
        .toEqual({ Enable: true, Rollback: true });
      expect(svc.Properties.DeploymentConfiguration.MinimumHealthyPercent).toBe(100);
      // Adding DeploymentController to these fixed-name services means a replacement.
      expect(svc.Properties.DeploymentController).toBeUndefined();
    }
  });

  // The loader task role predates CDK; data/load_search.py now embeds documents with Titan v2.
  test('loader role may invoke only the Titan v2 embedding model', () => {
    const policies = Object.values(template.findResources('AWS::IAM::Policy')) as any[];
    const loader = policies.filter((p) =>
      JSON.stringify(p.Properties.Roles ?? []).includes('ontology-mfg-dev-loader-task-role'));
    expect(loader).toHaveLength(1);
    expect(loader[0].Properties.PolicyDocument.Statement).toEqual([{
      Effect: 'Allow',
      Action: 'bedrock:InvokeModel',
      Resource: 'arn:aws:bedrock:ap-northeast-2::foundation-model/amazon.titan-embed-text-v2:0',
    }]);
  });

  // ADR-002 follow-up: the regex deny-list in chat._tool_neptune is the first line of
  // defence; IAM must also refuse writes so a deny-list bypass cannot mutate the graph.
  test('API task role can only read Neptune (no write/delete/wildcard)', () => {
    const neptuneActions: string[] = [];
    for (const policy of Object.values(template.findResources('AWS::IAM::Policy'))) {
      for (const stmt of (policy as any).Properties.PolicyDocument.Statement) {
        const actions = ([] as string[]).concat(stmt.Action);
        neptuneActions.push(...actions.filter((a) => a.startsWith('neptune-db:')));
      }
    }
    expect(neptuneActions).toContain('neptune-db:ReadDataViaQuery');
    expect(neptuneActions).not.toContain('neptune-db:*');
    expect(neptuneActions).not.toContain('neptune-db:connect'); // legacy catch-all
    expect(neptuneActions.filter((a) => /Write|Delete|Reset|Start/.test(a))).toEqual([]);
  });

  test('ALB listener with /api/* rule', () => {
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::ListenerRule', {
      Conditions: Match.arrayWith([
        Match.objectLike({
          Field: 'path-pattern',
          PathPatternConfig: { Values: Match.arrayWith(['/api/*']) },
        }),
      ]),
    });
  });

  test('2 Fargate services with ARM64', () => {
    template.resourceCountIs('AWS::ECS::Service', 2);
    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      RuntimePlatform: { CpuArchitecture: 'ARM64' },
    });
  });

  // Locks in the IAM-scoping invariant from the 0.4.0 harness-eval
  // finding: no IAM policy attached to a task role may grant
  // Action:"*" with Resource:"*". A regression here would mean the
  // API/Web tasks could perform any AWS action against any resource.
  test('No IAM policy grants Action:* on Resource:* (allow effect)', () => {
    const policies = template.findResources('AWS::IAM::Policy');
    for (const [logicalId, policy] of Object.entries(policies)) {
      const stmts = (policy as any).Properties?.PolicyDocument?.Statement ?? [];
      for (const stmt of stmts) {
        const actions = Array.isArray(stmt.Action) ? stmt.Action : [stmt.Action];
        const resources = Array.isArray(stmt.Resource) ? stmt.Resource : [stmt.Resource];
        const wildcardAction = actions.includes('*');
        const wildcardResource = resources.includes('*');
        if (wildcardAction && wildcardResource && stmt.Effect !== 'Deny') {
          throw new Error(
            `IAM Policy ${logicalId} grants Action:"*" on Resource:"*" — ` +
            `task roles must be scoped (see harness-eval 0.4.0 finding).`,
          );
        }
      }
    }
  });
});
