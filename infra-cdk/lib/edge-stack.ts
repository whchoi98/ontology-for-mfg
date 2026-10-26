import { Stack, StackProps, RemovalPolicy, Duration, CfnOutput, Tags } from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import * as fs from 'fs';
import { Construct } from 'constructs';

export interface EdgeStackProps extends StackProps {
  projectName: string;
  envName: string;
  albDnsName: string;
  domainName: string;
  hostedZoneName: string;
}

export class EdgeStack extends Stack {
  public readonly userPool: cognito.UserPool;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: EdgeStackProps) {
    // EdgeStack must be in us-east-1 for Lambda@Edge + ACM
    super(scope, id, { ...props, env: { ...props.env, region: 'us-east-1' } });
    const { projectName, envName, albDnsName } = props;
    const prefix = `${projectName}-${envName}`;

    // ==== Cognito User Pool ====
    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `${prefix}-pool`,
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      autoVerify: { email: true },
      mfa: cognito.Mfa.OPTIONAL,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // 6 groups
    for (const g of ['buyer', 'engineer', 'quality', 'scm', 'plant', 'admin']) {
      new cognito.CfnUserPoolGroup(this, `Group${g}`, {
        userPoolId: this.userPool.userPoolId,
        groupName: g,
        description: `mfg ${g} persona`,
      });
    }

    // 2 seed users (admin + demo)
    const adminUser = new cognito.CfnUserPoolUser(this, 'AdminUser', {
      userPoolId: this.userPool.userPoolId,
      username: 'admin@whchoi.net',
      userAttributes: [
        { name: 'email', value: 'admin@whchoi.net' },
        { name: 'email_verified', value: 'true' },
      ],
      messageAction: 'SUPPRESS',
    });
    const demoUser = new cognito.CfnUserPoolUser(this, 'DemoUser', {
      userPoolId: this.userPool.userPoolId,
      username: 'demo@whchoi.net',
      userAttributes: [
        { name: 'email', value: 'demo@whchoi.net' },
        { name: 'email_verified', value: 'true' },
      ],
      messageAction: 'SUPPRESS',
    });
    new cognito.CfnUserPoolUserToGroupAttachment(this, 'AdminUserGroup', {
      userPoolId: this.userPool.userPoolId,
      username: adminUser.ref, groupName: 'admin',
    });
    new cognito.CfnUserPoolUserToGroupAttachment(this, 'DemoUserGroup', {
      userPoolId: this.userPool.userPoolId,
      username: demoUser.ref, groupName: 'buyer',
    });

    // Passwords are set out-of-band (1Password vault `ontology-mfg-demo`). The former
    // adminSetUserPassword custom resources were removed: the repo copy of the password
    // is a scrubbed placeholder, so any redeploy would have reset both demo logins to it.
    // Removing them is a no-op for Cognito (no onDelete call).

    // App client + Hosted UI domain
    const client = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool: this.userPool,
      userPoolClientName: `${prefix}-client`,
      generateSecret: false,
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL],
        callbackUrls: [`https://${props.domainName}/api/auth/callback`],
        logoutUrls:   [`https://${props.domainName}/api/auth/logout`],
      },
    });
    new cognito.UserPoolDomain(this, 'UserPoolDomain', {
      userPool: this.userPool,
      cognitoDomain: { domainPrefix: `${prefix}` },
    });

    // ==== Lambda@Edge (viewer-request) ====
    // Lambda@Edge does NOT support env vars — the handler redirects to the API's
    // /api/auth/login (which owns the Cognito URL + OAuth state), so it needs no config.
    const edgeTemplatePath = path.join(__dirname, 'lambda-edge', 'index.js.tmpl');
    const edgeCode = fs.readFileSync(edgeTemplatePath, 'utf-8');

    const edgeFn = new cloudfront.experimental.EdgeFunction(this, 'EdgeAuthFn', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(edgeCode),
    });

    // ==== ACM Certificate (us-east-1, required for CloudFront) ====
    // Wildcard *.whchoi.net cert from current account (061525506239), pre-issued.
    // Override via cdk context `certArn` if needed.
    const certArn = (this.node.tryGetContext('certArn') as string | undefined)
      ?? 'arn:aws:acm:us-east-1:061525506239:certificate/7d53182a-2a2a-4225-a319-4f94030561b7';
    const cert = acm.Certificate.fromCertificateArn(this, 'Cert', certArn);

    // ==== CloudFront Distribution ====
    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultRootObject: '',
      defaultBehavior: {
        origin: new origins.HttpOrigin(albDnsName, {
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        // Compression buffers SSE chunks at the edge — must be disabled so /api/chat
        // streams reach the browser one-by-one (each `delta`/`tool_call` event flushes immediately).
        compress: false,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        edgeLambdas: [{
          functionVersion: edgeFn.currentVersion,
          eventType: cloudfront.LambdaEdgeEventType.VIEWER_REQUEST,
        }],
      },
      domainNames: [props.domainName],
      certificate: cert,
      comment: `${prefix} mfg-ontology distribution`,
    });

    Tags.of(this).add('Project', projectName);
    Tags.of(this).add('Env', envName);

    new CfnOutput(this, 'UserPoolId',           { value: this.userPool.userPoolId,                 exportName: `${prefix}-user-pool-id` });
    new CfnOutput(this, 'UserPoolClientId',     { value: client.userPoolClientId,                  exportName: `${prefix}-user-pool-client-id` });
    new CfnOutput(this, 'CloudFrontDomainName', { value: this.distribution.distributionDomainName, exportName: `${prefix}-cf-domain` });
  }
}
