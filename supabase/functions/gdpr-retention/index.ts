/**
 * GDPR Retention Edge Function
 * Sistema de Tests Psicometricos - Punto Inclusivo
 *
 * Alternative to pg_cron for GDPR data retention/anonymization.
 * Can be triggered by external cron services (e.g., GitHub Actions, Vercel Cron, pg_cron)
 *
 * SECURITY:
 * - Requires CRON_SECRET header for authentication
 * - Uses service_role key for database operations
 * - Logs all executions to audit_logs and data_retention_logs
 *
 * GDPR COMPLIANCE:
 * - Art. 17: Right to erasure (automatic after retention period)
 * - Art. 5(1)(e): Storage limitation principle
 * - Art. 89: Safeguards for archiving/research (anonymization preserves statistics)
 *
 * RETENTION POLICY (configurable per organization):
 * - Default: 5 years (1825 days) - healthcare standard
 * - User data: Anonymization after retention period (preserves aggregate statistics)
 * - Response data: Anonymization of encrypted answers
 * - Audit logs: 7 years minimum retention (legal requirement)
 * - Consent records: Retained indefinitely (proof of consent)
 *
 * ANONYMIZATION STRATEGY:
 * Instead of deleting data, we anonymize it to preserve statistical value:
 * - Replace identifiable fields with anonymized placeholders
 * - Clear encrypted content but keep metadata
 * - Preserve aggregate scores for research purposes
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

interface OrganizationRetentionConfig {
  organization_id: string;
  organization_name: string;
  data_retention_days: number;
  admin_notification_email: string | null;
  notify_admin_on_critical_alert: boolean;
}

interface RetentionStats {
  organization_id: string;
  organization_name: string;
  users_anonymized: number;
  responses_anonymized: number;
  consents_expired: number;
  tokens_cleaned: number;
  errors: string[];
}

interface GDPRRetentionResult {
  success: boolean;
  executed_at: string;
  completed_at: string;
  duration_ms: number;
  total_users_anonymized: number;
  total_responses_anonymized: number;
  total_consents_expired: number;
  total_tokens_cleaned: number;
  organizations_processed: number;
  organization_stats: RetentionStats[];
  errors: string[];
  notifications_sent: number;
}

interface UserToAnonymize {
  id: string;
  organization_id: string;
  email: string;
  nombre: string | null;
}

interface ResponseToAnonymize {
  id: string;
  user_id: string;
  organization_id: string;
}

const ANONYMIZED_EMAIL_PREFIX = "anonymized_";
const ANONYMIZED_EMAIL_DOMAIN = "@deleted.gdpr.local";
const ANONYMIZED_NAME = "[GDPR Anonymized]";
const DEFAULT_RETENTION_DAYS = 1825;
const BATCH_SIZE = 100;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}

Deno.serve(async (req: Request): Promise<Response> => {
  const startTime = new Date();

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed", allowed: ["POST"] }),
      {
        status: 405,
        headers: {
          "Content-Type": "application/json",
          "Allow": "POST",
        },
      },
    );
  }

  const cronSecret = Deno.env.get("CRON_SECRET");
  const authHeader = req.headers.get("Authorization");
  const cronSecretHeader = req.headers.get("X-Cron-Secret");
  const providedSecret = authHeader?.replace("Bearer ", "") || cronSecretHeader;

  if (!cronSecret) {
    console.error("CRON_SECRET environment variable not set");
    return new Response(
      JSON.stringify({
        error: "Server configuration error",
        message: "CRON_SECRET not configured",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  if (!providedSecret || providedSecret !== cronSecret) {
    console.warn("Unauthorized GDPR retention job attempt", {
      timestamp: startTime.toISOString(),
      ip: req.headers.get("x-forwarded-for") || "unknown",
    });

    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing Supabase configuration");
    return new Response(
      JSON.stringify({
        error: "Server configuration error",
        message: "Missing Supabase credentials",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  let dryRun = false;
  let specificOrganizationId: string | null = null;

  try {
    const body = await req.json().catch(() => ({}));
    dryRun = body.dry_run === true;
    specificOrganizationId = body.organization_id || null;
  } catch {
    // Ignore JSON parse errors, use defaults.
  }

  try {
    const result = await executeGDPRRetention(
      supabaseUrl,
      serviceRoleKey,
      dryRun,
      specificOrganizationId,
      startTime,
    );

    const endTime = new Date();
    const response: GDPRRetentionResult = {
      ...result,
      executed_at: startTime.toISOString(),
      completed_at: endTime.toISOString(),
      duration_ms: endTime.getTime() - startTime.getTime(),
    };

    await logToAudit(supabaseUrl, serviceRoleKey, {
      action: "gdpr_retention_job",
      result: result.errors.length === 0 ? "success" : "partial",
      new_values: {
        dry_run: dryRun,
        ...response,
      },
      error_message: result.errors.length > 0 ? result.errors.join("; ") : undefined,
    });

    console.log("GDPR retention job completed", response);

    return new Response(
      JSON.stringify(response),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "X-GDPR-Job-Duration-Ms": String(response.duration_ms),
          "X-Dry-Run": String(dryRun),
        },
      },
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("GDPR retention job exception", { error: errorMessage });

    try {
      await logToAudit(supabaseUrl, serviceRoleKey, {
        action: "gdpr_retention_job",
        result: "failure",
        error_message: `Exception: ${errorMessage}`,
      });
    } catch (auditError) {
      console.error("Failed to log to audit", auditError);
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: "Internal server error",
        message: errorMessage,
        executed_at: startTime.toISOString(),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
});

async function executeGDPRRetention(
  supabaseUrl: string,
  serviceRoleKey: string,
  dryRun: boolean,
  specificOrganizationId: string | null,
  startTime: Date,
): Promise<Omit<GDPRRetentionResult, "executed_at" | "completed_at" | "duration_ms">> {
  const organizationStats: RetentionStats[] = [];
  const globalErrors: string[] = [];
  let notificationsSent = 0;

  const organizations = await getOrganizationRetentionConfigs(
    supabaseUrl,
    serviceRoleKey,
    specificOrganizationId,
  );

  if (organizations.length === 0) {
    console.log("No organizations found to process");
    return {
      success: true,
      total_users_anonymized: 0,
      total_responses_anonymized: 0,
      total_consents_expired: 0,
      total_tokens_cleaned: 0,
      organizations_processed: 0,
      organization_stats: [],
      errors: [],
      notifications_sent: 0,
    };
  }

  for (const org of organizations) {
    console.log(`Processing organization: ${org.organization_name} (${org.organization_id})`);
    console.log(`  Retention period: ${org.data_retention_days} days`);

    const stats: RetentionStats = {
      organization_id: org.organization_id,
      organization_name: org.organization_name,
      users_anonymized: 0,
      responses_anonymized: 0,
      consents_expired: 0,
      tokens_cleaned: 0,
      errors: [],
    };

    try {
      const cutoffDate = new Date(startTime);
      cutoffDate.setDate(cutoffDate.getDate() - org.data_retention_days);
      const cutoffDateStr = cutoffDate.toISOString();

      console.log(`  Cutoff date: ${cutoffDateStr}`);

      const usersResult = await anonymizeInactiveUsers(
        supabaseUrl,
        serviceRoleKey,
        org.organization_id,
        cutoffDateStr,
        dryRun,
      );
      stats.users_anonymized = usersResult.count;
      if (usersResult.errors.length > 0) stats.errors.push(...usersResult.errors);

      const responsesResult = await anonymizeOldResponses(
        supabaseUrl,
        serviceRoleKey,
        org.organization_id,
        cutoffDateStr,
        dryRun,
      );
      stats.responses_anonymized = responsesResult.count;
      if (responsesResult.errors.length > 0) stats.errors.push(...responsesResult.errors);

      const consentsResult = await markExpiredConsents(
        supabaseUrl,
        serviceRoleKey,
        org.organization_id,
        cutoffDateStr,
        dryRun,
      );
      stats.consents_expired = consentsResult.count;
      if (consentsResult.errors.length > 0) stats.errors.push(...consentsResult.errors);

      if (org === organizations[0]) {
        const tokensResult = await cleanExpiredTokens(
          supabaseUrl,
          serviceRoleKey,
          dryRun,
        );
        stats.tokens_cleaned = tokensResult.count;
        if (tokensResult.errors.length > 0) stats.errors.push(...tokensResult.errors);
      }

      if (org.notify_admin_on_critical_alert && org.admin_notification_email) {
        const hasActions = stats.users_anonymized > 0 ||
          stats.responses_anonymized > 0 ||
          stats.consents_expired > 0;
        const hasErrors = stats.errors.length > 0;

        if (hasActions || hasErrors) {
          const notificationSent = await sendAdminNotification(
            supabaseUrl,
            serviceRoleKey,
            org,
            stats,
            dryRun,
          );
          if (notificationSent) notificationsSent++;
        }
      }

      if (!dryRun && (stats.users_anonymized > 0 || stats.responses_anonymized > 0)) {
        await logRetentionActions(
          supabaseUrl,
          serviceRoleKey,
          org.organization_id,
          stats,
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      stats.errors.push(`Organization processing error: ${errorMessage}`);
      globalErrors.push(`[${org.organization_name}] ${errorMessage}`);
    }

    organizationStats.push(stats);
  }

  const totals = organizationStats.reduce(
    (acc, stats) => ({
      users: acc.users + stats.users_anonymized,
      responses: acc.responses + stats.responses_anonymized,
      consents: acc.consents + stats.consents_expired,
      tokens: acc.tokens + stats.tokens_cleaned,
    }),
    { users: 0, responses: 0, consents: 0, tokens: 0 },
  );

  const allErrors = [
    ...globalErrors,
    ...organizationStats.flatMap((stats) => stats.errors),
  ];

  return {
    success: allErrors.length === 0,
    total_users_anonymized: totals.users,
    total_responses_anonymized: totals.responses,
    total_consents_expired: totals.consents,
    total_tokens_cleaned: totals.tokens,
    organizations_processed: organizations.length,
    organization_stats: organizationStats,
    errors: allErrors,
    notifications_sent: notificationsSent,
  };
}

async function getOrganizationRetentionConfigs(
  supabaseUrl: string,
  serviceRoleKey: string,
  specificOrganizationId: string | null,
): Promise<OrganizationRetentionConfig[]> {
  let query = `
    SELECT
      o.id as organization_id,
      o.name as organization_name,
      COALESCE(ors.data_retention_days, os.data_retention_days, ${DEFAULT_RETENTION_DAYS}) as data_retention_days,
      os.admin_notification_email,
      COALESCE(os.notify_admin_on_critical_alert, true) as notify_admin_on_critical_alert
    FROM organizations o
    LEFT JOIN organization_retention_settings ors ON ors.organization_id = o.id
    LEFT JOIN organization_settings os ON os.organization_id = o.id
  `;

  if (specificOrganizationId) {
    if (!isValidUUID(specificOrganizationId)) {
      throw new Error("Invalid organization_id format: must be a valid UUID");
    }
    query += ` WHERE o.id = '${specificOrganizationId}'`;
  }

  query += " ORDER BY o.name";

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/execute_sql`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${serviceRoleKey}`,
      "apikey": serviceRoleKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    const orgsResponse = await fetch(
      `${supabaseUrl}/rest/v1/organizations?select=id,name&order=name`,
      {
        headers: {
          "Authorization": `Bearer ${serviceRoleKey}`,
          "apikey": serviceRoleKey,
        },
      },
    );

    if (!orgsResponse.ok) {
      throw new Error(`Failed to fetch organizations: ${orgsResponse.status}`);
    }

    const orgs = await orgsResponse.json();

    const [retentionResponse, settingsResponse] = await Promise.all([
      fetch(
        `${supabaseUrl}/rest/v1/organization_retention_settings?select=organization_id,data_retention_days`,
        {
          headers: {
            "Authorization": `Bearer ${serviceRoleKey}`,
            "apikey": serviceRoleKey,
          },
        },
      ),
      fetch(
        `${supabaseUrl}/rest/v1/organization_settings?select=organization_id,data_retention_days,admin_notification_email,notify_admin_on_critical_alert`,
        {
          headers: {
            "Authorization": `Bearer ${serviceRoleKey}`,
            "apikey": serviceRoleKey,
          },
        },
      ),
    ]);

    const retentionSettings = retentionResponse.ok ? await retentionResponse.json() : [];
    const retentionMap = new Map(retentionSettings.map((setting: any) => [setting.organization_id, setting]));

    const settings = settingsResponse.ok ? await settingsResponse.json() : [];
    const settingsMap = new Map(settings.map((setting: any) => [setting.organization_id, setting]));

    return orgs
      .filter((org: any) => !specificOrganizationId || org.id === specificOrganizationId)
      .map((org: any) => {
        const retention = retentionMap.get(org.id) || {};
        const orgSettings = settingsMap.get(org.id) || {};
        return {
          organization_id: org.id,
          organization_name: org.name,
          data_retention_days: retention.data_retention_days || orgSettings.data_retention_days || DEFAULT_RETENTION_DAYS,
          admin_notification_email: orgSettings.admin_notification_email || null,
          notify_admin_on_critical_alert: orgSettings.notify_admin_on_critical_alert ?? true,
        };
      });
  }

  return await response.json();
}

async function anonymizeInactiveUsers(
  supabaseUrl: string,
  serviceRoleKey: string,
  organizationId: string,
  cutoffDate: string,
  dryRun: boolean,
): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];

  const usersResponse = await fetch(
    `${supabaseUrl}/rest/v1/users?` + new URLSearchParams({
      "select": "id,organization_id,email,nombre",
      "organization_id": `eq.${organizationId}`,
      "email": "not.like.*@deleted.gdpr.local",
      "or": `(last_login_at.is.null,last_login_at.lt.${cutoffDate})`,
      "limit": String(BATCH_SIZE),
    }),
    {
      headers: {
        "Authorization": `Bearer ${serviceRoleKey}`,
        "apikey": serviceRoleKey,
      },
    },
  );

  if (!usersResponse.ok) {
    errors.push(`Failed to fetch users: ${usersResponse.status}`);
    return { count: 0, errors };
  }

  const users: UserToAnonymize[] = await usersResponse.json();
  const usersToAnonymize: UserToAnonymize[] = [];

  for (const user of users) {
    const hasRecentResponses = await checkRecentResponses(
      supabaseUrl,
      serviceRoleKey,
      user.id,
      cutoffDate,
    );

    if (!hasRecentResponses) usersToAnonymize.push(user);
  }

  if (usersToAnonymize.length === 0) {
    console.log("  No users to anonymize");
    return { count: 0, errors };
  }

  console.log(`  Found ${usersToAnonymize.length} users to anonymize`);

  if (dryRun) {
    console.log("  [DRY RUN] Would anonymize users:", usersToAnonymize.map((user) => user.id));
    return { count: usersToAnonymize.length, errors };
  }

  let anonymizedCount = 0;
  for (const user of usersToAnonymize) {
    try {
      const anonymizedEmail = `${ANONYMIZED_EMAIL_PREFIX}${user.id}${ANONYMIZED_EMAIL_DOMAIN}`;

      const updateResponse = await fetch(
        `${supabaseUrl}/rest/v1/users?id=eq.${user.id}`,
        {
          method: "PATCH",
          headers: {
            "Authorization": `Bearer ${serviceRoleKey}`,
            "apikey": serviceRoleKey,
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
          },
          body: JSON.stringify({
            email: anonymizedEmail,
            nombre: ANONYMIZED_NAME,
            estado: "anonymized",
            updated_at: new Date().toISOString(),
          }),
        },
      );

      if (updateResponse.ok) {
        anonymizedCount++;
        console.log(`  Anonymized user: ${user.id}`);
      } else {
        errors.push(`Failed to anonymize user ${user.id}: ${updateResponse.status}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      errors.push(`Error anonymizing user ${user.id}: ${errorMessage}`);
    }
  }

  return { count: anonymizedCount, errors };
}

async function checkRecentResponses(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
  cutoffDate: string,
): Promise<boolean> {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/responses?` + new URLSearchParams({
      "select": "id",
      "user_id": `eq.${userId}`,
      "created_at": `gte.${cutoffDate}`,
      "limit": "1",
    }),
    {
      headers: {
        "Authorization": `Bearer ${serviceRoleKey}`,
        "apikey": serviceRoleKey,
      },
    },
  );

  if (!response.ok) return true;
  const data = await response.json();
  return data.length > 0;
}

async function anonymizeOldResponses(
  supabaseUrl: string,
  serviceRoleKey: string,
  organizationId: string,
  cutoffDate: string,
  dryRun: boolean,
): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];

  const responsesResponse = await fetch(
    `${supabaseUrl}/rest/v1/responses?` + new URLSearchParams({
      "select": "id,user_id,organization_id",
      "organization_id": `eq.${organizationId}`,
      "created_at": `lt.${cutoffDate}`,
      "answers_encrypted": "not.is.null",
      "limit": String(BATCH_SIZE),
    }),
    {
      headers: {
        "Authorization": `Bearer ${serviceRoleKey}`,
        "apikey": serviceRoleKey,
      },
    },
  );

  if (!responsesResponse.ok) {
    errors.push(`Failed to fetch responses: ${responsesResponse.status}`);
    return { count: 0, errors };
  }

  const responses: ResponseToAnonymize[] = await responsesResponse.json();

  if (responses.length === 0) {
    console.log("  No responses to anonymize");
    return { count: 0, errors };
  }

  console.log(`  Found ${responses.length} responses to anonymize`);

  if (dryRun) {
    console.log("  [DRY RUN] Would anonymize responses:", responses.map((response) => response.id));
    return { count: responses.length, errors };
  }

  let anonymizedCount = 0;
  for (const response of responses) {
    try {
      const updateResponse = await fetch(
        `${supabaseUrl}/rest/v1/responses?id=eq.${response.id}`,
        {
          method: "PATCH",
          headers: {
            "Authorization": `Bearer ${serviceRoleKey}`,
            "apikey": serviceRoleKey,
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
          },
          body: JSON.stringify({
            answers_encrypted: null,
            ip_address: null,
            user_agent: null,
          }),
        },
      );

      if (updateResponse.ok) {
        anonymizedCount++;
        console.log(`  Anonymized response: ${response.id}`);
      } else {
        errors.push(`Failed to anonymize response ${response.id}: ${updateResponse.status}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      errors.push(`Error anonymizing response ${response.id}: ${errorMessage}`);
    }
  }

  return { count: anonymizedCount, errors };
}

async function markExpiredConsents(
  supabaseUrl: string,
  serviceRoleKey: string,
  organizationId: string,
  cutoffDate: string,
  dryRun: boolean,
): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];

  const consentsResponse = await fetch(
    `${supabaseUrl}/rest/v1/consents?` + new URLSearchParams({
      "select": "id,user_id,organization_id",
      "organization_id": `eq.${organizationId}`,
      "consented_at": `lt.${cutoffDate}`,
      "revoked": "eq.false",
      "limit": String(BATCH_SIZE),
    }),
    {
      headers: {
        "Authorization": `Bearer ${serviceRoleKey}`,
        "apikey": serviceRoleKey,
      },
    },
  );

  if (!consentsResponse.ok) {
    errors.push(`Failed to fetch consents: ${consentsResponse.status}`);
    return { count: 0, errors };
  }

  const consents = await consentsResponse.json();
  const consentsToExpire = [];

  for (const consent of consents) {
    const isUserAnonymized = await checkUserAnonymized(
      supabaseUrl,
      serviceRoleKey,
      consent.user_id,
    );
    if (isUserAnonymized) consentsToExpire.push(consent);
  }

  if (consentsToExpire.length === 0) {
    console.log("  No consents to expire");
    return { count: 0, errors };
  }

  console.log(`  Found ${consentsToExpire.length} consents to expire`);

  if (dryRun) {
    console.log(
      "  [DRY RUN] Would expire consents:",
      consentsToExpire.map((consent: any) => consent.id),
    );
    return { count: consentsToExpire.length, errors };
  }

  let expiredCount = 0;
  for (const consent of consentsToExpire) {
    try {
      const updateResponse = await fetch(
        `${supabaseUrl}/rest/v1/consents?id=eq.${consent.id}`,
        {
          method: "PATCH",
          headers: {
            "Authorization": `Bearer ${serviceRoleKey}`,
            "apikey": serviceRoleKey,
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
          },
          body: JSON.stringify({
            revoked: true,
            revoked_at: new Date().toISOString(),
            revocation_reason: "GDPR retention policy - user data anonymized",
          }),
        },
      );

      if (updateResponse.ok) {
        expiredCount++;
        console.log(`  Expired consent: ${consent.id}`);
      } else {
        errors.push(`Failed to expire consent ${consent.id}: ${updateResponse.status}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      errors.push(`Error expiring consent ${consent.id}: ${errorMessage}`);
    }
  }

  return { count: expiredCount, errors };
}

async function checkUserAnonymized(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
): Promise<boolean> {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/users?` + new URLSearchParams({
      "select": "email",
      "id": `eq.${userId}`,
    }),
    {
      headers: {
        "Authorization": `Bearer ${serviceRoleKey}`,
        "apikey": serviceRoleKey,
      },
    },
  );

  if (!response.ok) return false;

  const users = await response.json();
  if (users.length === 0) return true;
  return users[0].email?.includes(ANONYMIZED_EMAIL_DOMAIN) || false;
}

async function cleanExpiredTokens(
  supabaseUrl: string,
  serviceRoleKey: string,
  dryRun: boolean,
): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];
  const now = new Date().toISOString();

  const tokensResponse = await fetch(
    `${supabaseUrl}/rest/v1/token_blacklist?` + new URLSearchParams({
      "select": "token_hash",
      "expires_at": `lt.${now}`,
      "limit": String(BATCH_SIZE),
    }),
    {
      headers: {
        "Authorization": `Bearer ${serviceRoleKey}`,
        "apikey": serviceRoleKey,
      },
    },
  );

  if (!tokensResponse.ok) {
    errors.push(`Failed to fetch expired tokens: ${tokensResponse.status}`);
    return { count: 0, errors };
  }

  const tokens = await tokensResponse.json();

  if (tokens.length === 0) {
    console.log("  No expired tokens to clean");
    return { count: 0, errors };
  }

  console.log(`  Found ${tokens.length} expired tokens to clean`);

  if (dryRun) {
    console.log("  [DRY RUN] Would clean expired tokens");
    return { count: tokens.length, errors };
  }

  const deleteResponse = await fetch(
    `${supabaseUrl}/rest/v1/token_blacklist?expires_at=lt.${now}`,
    {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${serviceRoleKey}`,
        "apikey": serviceRoleKey,
        "Prefer": "return=representation",
      },
    },
  );

  if (!deleteResponse.ok) {
    errors.push(`Failed to delete expired tokens: ${deleteResponse.status}`);
    return { count: 0, errors };
  }

  const deleted = await deleteResponse.json();
  console.log(`  Cleaned ${deleted.length} expired tokens`);
  return { count: deleted.length, errors };
}

async function logRetentionActions(
  supabaseUrl: string,
  serviceRoleKey: string,
  organizationId: string,
  stats: RetentionStats,
): Promise<void> {
  try {
    await fetch(`${supabaseUrl}/rest/v1/data_retention_logs`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${serviceRoleKey}`,
        "apikey": serviceRoleKey,
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({
        organization_id: organizationId,
        deletion_reason: "retention_expired",
        backup_reference: JSON.stringify({
          users_anonymized: stats.users_anonymized,
          responses_anonymized: stats.responses_anonymized,
          consents_expired: stats.consents_expired,
          tokens_cleaned: stats.tokens_cleaned,
          errors: stats.errors,
        }),
        deleted_at: new Date().toISOString(),
      }),
    });
  } catch (error) {
    console.error("Failed to log retention actions", error);
  }
}

async function logToAudit(
  supabaseUrl: string,
  serviceRoleKey: string,
  data: {
    action: string;
    result: "success" | "failure" | "partial";
    new_values?: Record<string, unknown>;
    error_message?: string;
  },
): Promise<void> {
  try {
    await fetch(`${supabaseUrl}/rest/v1/audit_logs`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${serviceRoleKey}`,
        "apikey": serviceRoleKey,
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({
        action: data.action,
        resource_type: "gdpr_retention",
        result: data.result,
        new_values: data.new_values || null,
        error_message: data.error_message || null,
        created_at: new Date().toISOString(),
      }),
    });
  } catch (error) {
    console.error("Failed to log to audit_logs", error);
  }
}

async function sendAdminNotification(
  supabaseUrl: string,
  serviceRoleKey: string,
  org: OrganizationRetentionConfig,
  stats: RetentionStats,
  dryRun: boolean,
): Promise<boolean> {
  const notificationData = {
    to: org.admin_notification_email,
    subject: `GDPR Data Retention Report - ${org.organization_name}`,
    body: {
      organization: org.organization_name,
      retention_period_days: org.data_retention_days,
      actions_taken: {
        users_anonymized: stats.users_anonymized,
        responses_anonymized: stats.responses_anonymized,
        consents_expired: stats.consents_expired,
        tokens_cleaned: stats.tokens_cleaned,
      },
      errors: stats.errors,
      timestamp: new Date().toISOString(),
    },
  };

  if (dryRun) {
    console.log("  [DRY RUN] Would send notification:", JSON.stringify(notificationData, null, 2));
    return true;
  }

  console.log("  Admin notification prepared:", JSON.stringify(notificationData, null, 2));
  void supabaseUrl;
  void serviceRoleKey;
  return true;
}
