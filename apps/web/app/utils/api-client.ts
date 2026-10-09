type ApiResponse = Promise<Response>;
type EndpointOptions = { param?: Record<string, string>; query?: Record<string, string | undefined>; json?: unknown };
export type ApiFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** Minimal route surface used by the Builder; API schemas validate payloads. */
export interface NexaApiClient {
  auth: {
    me: { $get(): ApiResponse };
    login: { $post(options: EndpointOptions): ApiResponse };
    signup: { $post(options: EndpointOptions): ApiResponse };
    logout: { $post(): ApiResponse };
  };
  modules: {
    $get(options?: EndpointOptions): ApiResponse;
    $post(options: EndpointOptions): ApiResponse;
    ':id': {
      $get(options: EndpointOptions): ApiResponse;
      $patch(options: EndpointOptions): ApiResponse;
      transition: { $post(options: EndpointOptions): ApiResponse };
    };
    ':moduleId': {
      schema: { $get(options: EndpointOptions): ApiResponse };
      entities: {
        $get(options: EndpointOptions): ApiResponse;
        $post(options: EndpointOptions): ApiResponse;
        ':id': { $get(options: EndpointOptions): ApiResponse };
        ':entityId': {
          fields: { $post(options: EndpointOptions): ApiResponse };
          records: {
            $get(options: EndpointOptions): ApiResponse;
            $post(options: EndpointOptions): ApiResponse;
            ':recordId': {
              $get(options: EndpointOptions): ApiResponse;
              $patch(options: EndpointOptions): ApiResponse;
              $delete(options: EndpointOptions): ApiResponse;
              activity: { $get(options: EndpointOptions): ApiResponse };
              relations: {
                ':relationId': {
                  $get(options: EndpointOptions): ApiResponse;
                  ':targetRecordId': {
                    $post(options: EndpointOptions): ApiResponse;
                    $delete(options: EndpointOptions): ApiResponse;
                  };
                };
              };
            };
          };
        };
      };
      fields: { $get(options: EndpointOptions): ApiResponse };
      relations: { $get(options: EndpointOptions): ApiResponse; $post(options: EndpointOptions): ApiResponse };
    };
  };
}

/** Creates a credentialed browser client at the API origin (without /v1). */
export function createApiClient(baseUrl: string, fetchImpl: ApiFetch = fetch): NexaApiClient {
  const base = baseUrl.replace(/\/$/, '');
  const request: ApiFetch = (input, init) => fetchImpl(input, { ...init, credentials: 'include' });
  const jsonRequest = (url: string, method: string, json: unknown) => request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(json),
  });
  const moduleUrl = (param?: Record<string, string>) => `${base}/v1/modules/${encodeURIComponent(param?.moduleId ?? '')}`;
  const entityUrl = (param?: Record<string, string>) => `${moduleUrl(param)}/entities/${encodeURIComponent(param?.entityId ?? '')}`;
  const recordUrl = (param?: Record<string, string>) => `${entityUrl(param)}/records/${encodeURIComponent(param?.recordId ?? '')}`;
  const targetUrl = (param?: Record<string, string>) => `${recordUrl(param)}/relations/${encodeURIComponent(param?.relationId ?? '')}/${encodeURIComponent(param?.targetRecordId ?? '')}`;
  return {
    auth: {
      me: { $get: () => request(`${base}/v1/auth/me`) },
      login: { $post: ({ json }) => jsonRequest(`${base}/v1/auth/login`, 'POST', json) },
      signup: { $post: ({ json }) => jsonRequest(`${base}/v1/auth/signup`, 'POST', json) },
      logout: { $post: () => request(`${base}/v1/auth/logout`, { method: 'POST' }) },
    },
    modules: {
      $get: (options = {}) => request(`${base}/v1/modules${queryString(options.query)}`),
      $post: ({ json }) => jsonRequest(`${base}/v1/modules`, 'POST', json),
      ':id': {
        $get: ({ param }) => request(`${base}/v1/modules/${encodeURIComponent(param?.id ?? '')}`),
        $patch: ({ param, json }) => jsonRequest(`${base}/v1/modules/${encodeURIComponent(param?.id ?? '')}`, 'PATCH', json),
        transition: { $post: ({ param, json }) => jsonRequest(`${base}/v1/modules/${encodeURIComponent(param?.id ?? '')}/transition`, 'POST', json) },
      },
      ':moduleId': {
        schema: { $get: ({ param }) => request(`${moduleUrl(param)}/schema`) },
        entities: {
          $get: ({ param }) => request(`${moduleUrl(param)}/entities`),
          $post: ({ param, json }) => jsonRequest(`${moduleUrl(param)}/entities`, 'POST', json),
          ':id': { $get: ({ param }) => request(`${moduleUrl(param)}/entities/${encodeURIComponent(param?.id ?? '')}`) },
          ':entityId': {
            fields: { $post: ({ param, json }) => jsonRequest(`${moduleUrl(param)}/entities/${encodeURIComponent(param?.entityId ?? '')}/fields`, 'POST', json) },
            records: {
              $get: ({ param, query }) => request(`${entityUrl(param)}/records${queryString(query)}`),
              $post: ({ param, json }) => jsonRequest(`${entityUrl(param)}/records`, 'POST', json),
              ':recordId': {
                $get: ({ param }) => request(`${recordUrl(param)}`),
                $patch: ({ param, json }) => jsonRequest(`${recordUrl(param)}`, 'PATCH', json),
                $delete: ({ param }) => request(`${recordUrl(param)}`, { method: 'DELETE' }),
                activity: { $get: ({ param, query }) => request(`${recordUrl(param)}/activity${queryString(query)}`) },
                relations: {
                  ':relationId': {
                    $get: ({ param }) => request(`${recordUrl(param)}/relations/${encodeURIComponent(param?.relationId ?? '')}`),
                    ':targetRecordId': {
                      $post: ({ param }) => request(`${targetUrl(param)}`, { method: 'POST' }),
                      $delete: ({ param }) => request(`${targetUrl(param)}`, { method: 'DELETE' }),
                    },
                  },
                },
              },
            },
          },
        },
        fields: { $get: ({ param, query }) => request(`${moduleUrl(param)}/fields${queryString(query)}`) },
        relations: {
          $get: ({ param }) => request(`${moduleUrl(param)}/relations`),
          $post: ({ param, json }) => jsonRequest(`${moduleUrl(param)}/relations`, 'POST', json),
        },
      },
    },
  };
}

function queryString(query?: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) if (value !== undefined) params.set(key, value);
  const result = params.toString();
  return result ? `?${result}` : '';
}
