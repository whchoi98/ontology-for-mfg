import { Stack, StackProps, RemovalPolicy, Duration, CfnOutput, Tags } from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cr from 'aws-cdk-lib/custom-resources';
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

    // Custom resource — set permanent password `***ROTATED***` (admin-set, suppress reset)
    const setPwRole = new iam.Role(this, 'SetPwRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });
    setPwRole.addToPolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:AdminSetUserPassword'],
      resources: [this.userPool.userPoolArn],
    }));
    setPwRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'));
    const setPw = new cr.AwsCustomResource(this, 'SetAdminPw', {
      onUpdate: {
        service: 'CognitoIdentityServiceProvider',
        action: 'adminSetUserPassword',
        parameters: {
          UserPoolId: this.userPool.userPoolId,
          Username: 'admin@whchoi.net',
          Password: '***ROTATED***',
          Permanent: true,
        },
        physicalResourceId: cr.PhysicalResourceId.of('admin-pw'),
      },
      role: setPwRole,
    });
    setPw.node.addDependency(adminUser);
    const setPwDemo = new cr.AwsCustomResource(this, 'SetDemoPw', {
      onUpdate: {
        service: 'CognitoIdentityServiceProvider',
        action: 'adminSetUserPassword',
        parameters: {
          UserPoolId: this.userPool.userPoolId,
          Username: 'demo@whchoi.net',
          Password: '***ROTATED***',
          Permanent: true,
        },
        physicalResourceId: cr.PhysicalResourceId.of('demo-pw'),
      },
      role: setPwRole,
    });
    setPwDemo.node.addDependency(demoUser);

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
    // Lambda@Edge does NOT support env vars — read template, substitute from CDK
    // resource attributes, and bundle as inline code.
    const edgeTemplatePath = path.join(__dirname, 'lambda-edge', 'index.js.tmpl');
    const cognitoDomainStr = `${prefix}.auth.us-east-1.amazoncognito.com`;
    const callbackUrl = `https://${props.domainName}/api/auth/callback`;
    const edgeCode = fs.readFileSync(edgeTemplatePath, 'utf-8')
      .replace('{{COGNITO_DOMAIN}}', cognitoDomainStr)
      .replace('{{CLIENT_ID}}', client.userPoolClientId)
      .replace('{{CALLBACK_URL}}', callbackUrl);

    const edgeFn = new cloudfront.experimental.EdgeFunction(this, 'EdgeAuthFn', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(edgeCode),
    });

    // ==== ACM Certificate (us-east-1, required for CloudFront) ====
    // certArn is passed via cdk context when cert is validated
    const certArn = this.node.tryGetContext('certArn') as string | undefined;
    const cert = certArn
      ? acm.Certificate.fromCertificateArn(this, 'Cert', certArn)
      : undefined;

    // ==== CloudFront Distribution ====
    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultRootObject: '',
      defaultBehavior: {
        origin: new origins.HttpOrigin(albDnsName, {
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
        edgeLambdas: [{
          functionVersion: edgeFn.currentVersion,
          eventType: cloudfront.LambdaEdgeEventType.VIEWER_REQUEST,
        }],
      },
      // Custom domain + ACM cert wired when certArn context is provided
      ...(cert ? {
        domainNames: [props.domainName],
        certificate: cert,
      } : {}),
      comment: `${prefix} mfg-ontology distribution`,
    });

    Tags.of(this).add('Project', projectName);
    Tags.of(this).add('Env', envName);

    new CfnOutput(this, 'UserPoolId',           { value: this.userPool.userPoolId,                 exportName: `${prefix}-user-pool-id` });
    new CfnOutput(this, 'UserPoolClientId',     { value: client.userPoolClientId,                  exportName: `${prefix}-user-pool-client-id` });
    new CfnOutput(this, 'CloudFrontDomainName', { value: this.distribution.distributionDomainName, exportName: `${prefix}-cf-domain` });
  }
}
