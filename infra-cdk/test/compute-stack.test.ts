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
