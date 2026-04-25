import {
  getSupabaseServiceRoleKey,
  getSupabaseStorageBucket,
  getSupabaseUrl,
  shouldUseSupabase,
} from "@/lib/config";

let bucketSetupPromise: Promise<void> | null = null;

function getSupabaseConfig() {
  const url = getSupabaseUrl();
  const serviceRoleKey = getSupabaseServiceRoleKey();

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  return {
    url: url.replace(/\/$/, ""),
    serviceRoleKey,
    bucket: getSupabaseStorageBucket(),
  };
}

function getServerHeaders(contentType = "application/json") {
  const { serviceRoleKey } = getSupabaseConfig();
  const headers: Record<string, string> = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };

  if (contentType) headers["Content-Type"] = contentType;
  return headers;
}

async function readSupabaseError(response: Response) {
  const text = await response.text();
  if (!text) return `${response.status} ${response.statusText}`;

  try {
    const payload = JSON.parse(text) as { message?: string; error?: string };
    return payload.message ?? payload.error ?? text;
  } catch {
    return text;
  }
}

export function isSupabaseBackendEnabled() {
  return shouldUseSupabase();
}

export async function supabaseRestRequest<T>(
  path: string,
  init: RequestInit = {},
) {
  const { url } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1${path}`, {
    ...init,
    headers: {
      ...getServerHeaders(),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await readSupabaseError(response));
  }

  if (response.status === 204) return null as T;

  const text = await response.text();
  if (!text) return null as T;
  return JSON.parse(text) as T;
}

async function supabaseStorageRequest<T>(
  path: string,
  init: RequestInit = {},
  contentType = "application/json",
) {
  const { url } = getSupabaseConfig();
  const response = await fetch(`${url}/storage/v1${path}`, {
    ...init,
    headers: {
      ...getServerHeaders(contentType),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await readSupabaseError(response));
  }

  if (response.status === 204) return null as T;
  const responseType = response.headers.get("content-type") ?? "";
  if (responseType.includes("application/json")) {
    return await response.json() as T;
  }

  return null as T;
}

export async function ensureSupabaseStorageBucket() {
  if (!isSupabaseBackendEnabled()) return;
  if (!bucketSetupPromise) {
    bucketSetupPromise = (async () => {
      const { bucket } = getSupabaseConfig();

      try {
        await supabaseStorageRequest(`/bucket/${encodeURIComponent(bucket)}`, {
          method: "GET",
        });
        return;
      } catch {
        // Create the bucket below. If another process already created it, the
        // follow-up request can safely fail without blocking normal uploads.
      }

      try {
        await supabaseStorageRequest("/bucket", {
          method: "POST",
          body: JSON.stringify({
            id: bucket,
            name: bucket,
            public: false,
          }),
        });
      } catch {
        await supabaseStorageRequest(`/bucket/${encodeURIComponent(bucket)}`, {
          method: "GET",
        });
      }
    })();
  }

  await bucketSetupPromise;
}

export async function uploadSupabaseObject(
  relativePath: string,
  body: Buffer,
  contentType: string,
) {
  await ensureSupabaseStorageBucket();
  const { bucket } = getSupabaseConfig();
  const safePath = relativePath.split("/").map(encodeURIComponent).join("/");
  const uploadBody = body.buffer.slice(
    body.byteOffset,
    body.byteOffset + body.byteLength,
  ) as ArrayBuffer;

  await supabaseStorageRequest(
    `/object/${encodeURIComponent(bucket)}/${safePath}`,
    {
      method: "POST",
      headers: {
        "x-upsert": "false",
      },
      body: uploadBody,
    },
    contentType,
  );
}

export async function createSupabaseSignedUrl(relativePath: string, expiresIn = 300) {
  const { url, bucket } = getSupabaseConfig();
  const safePath = relativePath.split("/").map(encodeURIComponent).join("/");
  const result = await supabaseStorageRequest<{ signedURL: string }>(
    `/object/sign/${encodeURIComponent(bucket)}/${safePath}`,
    {
      method: "POST",
      body: JSON.stringify({ expiresIn }),
    },
  );

  if (!result?.signedURL) {
    throw new Error("Supabase did not return a signed media URL.");
  }

  if (/^https?:\/\//i.test(result.signedURL)) {
    return result.signedURL;
  }

  return `${url}/storage/v1${result.signedURL}`;
}
