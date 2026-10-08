import { apiErrorFromResponse, normalizeApiError } from './api-error';

export async function requestData<T>(request: Promise<Response>): Promise<T> {
  let response: Response;
  try {
    response = await request;
  } catch (error) {
    throw normalizeApiError(error);
  }
  if (!response.ok) throw await apiErrorFromResponse(response);
  if (response.status === 204) return undefined as T;
  try {
    return await response.json() as T;
  } catch {
    throw normalizeApiError(undefined);
  }
}
