import type { Rule, CustomRule } from '../stores/useAppStore'

export interface BuiltinPreset {
  id: string
  name: string
  description: string
  rules: Partial<Record<string, Partial<Rule>>>
  customRules?: CustomRule[]
}

export const BUILTIN_PRESETS: BuiltinPreset[] = [
  {
    id: 'aws-cloudwatch',
    name: 'AWS CloudWatch',
    description: 'AWS logs with IPs, ARNs, account IDs',
    rules: {
      email: { enabled: true },
      ipv4: { enabled: true },
      ipv6: { enabled: true },
      aws_access_key: { enabled: true },
      aws_secret_key: { enabled: true },
      url: { enabled: true },
      hostname: { enabled: true },
      generic_secret: { enabled: true },
      session_id: { enabled: true },
      uuid: { enabled: true },
      datetime_iso: { enabled: false },
      timestamp_unix: { enabled: false },
    },
    customRules: [
      { id: 'aws_account_id', label: 'AWS Account ID', pattern: '\\b[0-9]{12}\\b', enabled: true, strategy: 'label' },
      { id: 'aws_arn', label: 'AWS ARN', pattern: 'arn:aws:[a-z0-9-]+:[a-z0-9-]*:[0-9]*:[a-zA-Z0-9-_/:.]+', enabled: true, strategy: 'label' },
    ]
  },
  {
    id: 'nginx-apache',
    name: 'nginx / Apache',
    description: 'Web server access & error logs',
    rules: {
      email: { enabled: true },
      ipv4: { enabled: true },
      ipv6: { enabled: true },
      url: { enabled: true },
      hostname: { enabled: true },
      bearer_token: { enabled: true },
      basic_auth: { enabled: true },
      session_id: { enabled: true },
      url_credentials: { enabled: true },
      datetime_iso: { enabled: false },
      date_dmy: { enabled: false },
      date_mdy: { enabled: false },
      time: { enabled: false },
    },
    customRules: [
      { id: 'user_agent', label: 'User Agent', pattern: '"Mozilla[^"]*"', enabled: false, strategy: 'label' },
      { id: 'http_referer', label: 'HTTP Referer', pattern: 'https?://[^\\s"]+', enabled: false, strategy: 'label' },
    ]
  },
  {
    id: 'docker-k8s',
    name: 'Docker / Kubernetes',
    description: 'Container orchestration logs',
    rules: {
      email: { enabled: true },
      ipv4: { enabled: true },
      ipv6: { enabled: true },
      hostname: { enabled: true },
      url: { enabled: true },
      uuid: { enabled: true },
      generic_secret: { enabled: true },
      private_key: { enabled: true },
      jwt: { enabled: true },
      bearer_token: { enabled: true },
    },
    customRules: [
      { id: 'container_id', label: 'Container ID', pattern: '\\b[a-f0-9]{64}\\b|\\b[a-f0-9]{12}\\b', enabled: true, strategy: 'label' },
      { id: 'k8s_namespace', label: 'K8s Namespace', pattern: 'namespace[=:]\\s*[a-z0-9-]+', enabled: false, strategy: 'label' },
      { id: 'docker_image', label: 'Docker Image', pattern: '[a-z0-9.-]+(?:/[a-z0-9._-]+)+(?::[a-z0-9._-]+)?', enabled: false, strategy: 'label' },
    ]
  },
  {
    id: 'database',
    name: 'Database Logs',
    description: 'MySQL, PostgreSQL, MongoDB logs',
    rules: {
      email: { enabled: true },
      ipv4: { enabled: true },
      hostname: { enabled: true },
      url_credentials: { enabled: true },
      generic_secret: { enabled: true },
      credit_card: { enabled: true },
      ssn: { enabled: true },
      uuid: { enabled: true },
    },
    customRules: [
      { id: 'db_connection_string', label: 'DB Connection String', pattern: '(?:mongodb|postgres|mysql|redis)://[^\\s]+', enabled: true, strategy: 'redact' },
      { id: 'sql_values', label: 'SQL String Values', pattern: "VALUES\\s*\\([^)]+\\)", enabled: false, strategy: 'label' },
    ]
  },
  {
    id: 'api-json',
    name: 'API / JSON Logs',
    description: 'REST API and JSON-formatted logs',
    rules: {
      email: { enabled: true },
      phone_us: { enabled: true },
      phone_uk: { enabled: true },
      phone_intl: { enabled: true },
      ipv4: { enabled: true },
      credit_card: { enabled: true },
      ssn: { enabled: true },
      jwt: { enabled: true },
      bearer_token: { enabled: true },
      generic_secret: { enabled: true },
      uuid: { enabled: true },
      url: { enabled: false },
      gps_coordinates: { enabled: true },
    },
    customRules: []
  },
  {
    id: 'security-audit',
    name: 'Security Audit',
    description: 'Maximum detection for security review',
    rules: {
      email: { enabled: true, strategy: 'redact' },
      phone_us: { enabled: true, strategy: 'redact' },
      phone_uk: { enabled: true, strategy: 'redact' },
      phone_intl: { enabled: true, strategy: 'redact' },
      ipv4: { enabled: true },
      ipv6: { enabled: true },
      mac_address: { enabled: true },
      ssn: { enabled: true, strategy: 'redact' },
      credit_card: { enabled: true, strategy: 'redact' },
      iban: { enabled: true, strategy: 'redact' },
      passport: { enabled: true, strategy: 'redact' },
      drivers_license: { enabled: true, strategy: 'redact' },
      jwt: { enabled: true, strategy: 'redact' },
      bearer_token: { enabled: true, strategy: 'redact' },
      aws_access_key: { enabled: true, strategy: 'redact' },
      aws_secret_key: { enabled: true, strategy: 'redact' },
      stripe_key: { enabled: true, strategy: 'redact' },
      gcp_api_key: { enabled: true, strategy: 'redact' },
      github_token: { enabled: true, strategy: 'redact' },
      slack_token: { enabled: true, strategy: 'redact' },
      generic_secret: { enabled: true, strategy: 'redact' },
      private_key: { enabled: true, strategy: 'redact' },
      basic_auth: { enabled: true, strategy: 'redact' },
      url_credentials: { enabled: true, strategy: 'redact' },
      btc_address: { enabled: true },
      eth_address: { enabled: true },
      gps_coordinates: { enabled: true },
      session_id: { enabled: true },
    },
    customRules: []
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Only high-confidence PII patterns',
    rules: {
      email: { enabled: true },
      credit_card: { enabled: true, strategy: 'redact' },
      ssn: { enabled: true, strategy: 'redact' },
      aws_access_key: { enabled: true, strategy: 'redact' },
      aws_secret_key: { enabled: true, strategy: 'redact' },
      private_key: { enabled: true, strategy: 'redact' },
      ipv4: { enabled: false },
      ipv6: { enabled: false },
      hostname: { enabled: false },
      url: { enabled: false },
      phone_us: { enabled: false },
      phone_uk: { enabled: false },
      phone_intl: { enabled: false },
      uuid: { enabled: false },
      jwt: { enabled: false },
      bearer_token: { enabled: false },
      generic_secret: { enabled: false },
    },
    customRules: []
  },
  {
    id: 'sip-voip',
    name: 'SIP / VoIP',
    description: 'SIP protocol traces with caller info, auth, and URIs',
    rules: {
      // SIP-specific rules
      sip_username: { enabled: true },
      sip_realm: { enabled: true },
      sip_nonce: { enabled: true },
      sip_response: { enabled: true },
      sip_from_display: { enabled: true },
      sip_to_display: { enabled: true },
      sip_contact: { enabled: true },
      sip_uri: { enabled: true },
      sip_call_id: { enabled: true },
      sip_branch: { enabled: true },
      sip_user_agent: { enabled: true },
      sip_via: { enabled: true },
      // Common network/contact rules useful for SIP
      ipv4: { enabled: true },
      ipv6: { enabled: true },
      phone_us: { enabled: true },
      phone_uk: { enabled: true },
      phone_intl: { enabled: true },
      email: { enabled: true },
      hostname: { enabled: true },
      // Disable noisy rules
      url: { enabled: false },
      uuid: { enabled: false },
      datetime_iso: { enabled: false },
      timestamp_unix: { enabled: false },
    },
    customRules: []
  },
]
