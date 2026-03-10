import { useMutation, useQuery, type UseMutationOptions, type UseQueryOptions } from "@tanstack/react-query";

type ApiClientOptions = {
  baseUrl: string;
  getToken?: () => Promise<string | null> | string | null;
};

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
};

export type ApiEnvelope<T> = {
  data: T | null;
  error: { code: string; message: string; details?: unknown } | null;
  meta: Record<string, unknown>;
};

export const createApiClient = ({ baseUrl, getToken }: ApiClientOptions) => {
  const request = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
    const token = getToken ? await getToken() : null;
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    const payload = (await response.json()) as ApiEnvelope<T>;

    if (!response.ok || payload.error) {
      throw new Error(payload.error?.message ?? "Erro na API");
    }

    if (payload.data === null) {
      throw new Error("Resposta sem dados");
    }

    return payload.data;
  };

  return {
    get: <T>(path: string) => request<T>(path),
    post: <T>(path: string, body: unknown) => request<T>(path, { method: "POST", body }),
    put: <T>(path: string, body: unknown) => request<T>(path, { method: "PUT", body }),
    patch: <T>(path: string, body: unknown) => request<T>(path, { method: "PATCH", body }),
    del: <T>(path: string) => request<T>(path, { method: "DELETE" })
  };
};

export const createBaseHooks = <TClient extends ReturnType<typeof createApiClient>>(client: TClient) => {
  return {
    useApiQuery<TData>(
      key: readonly unknown[],
      path: string,
      options?: Omit<UseQueryOptions<TData, Error, TData, readonly unknown[]>, "queryKey" | "queryFn">
    ) {
      return useQuery({
        queryKey: key,
        queryFn: () => client.get<TData>(path),
        ...options
      });
    },
    useApiMutation<TData, TVariables>(
      path: string,
      method: "post" | "put" | "patch" | "delete",
      options?: UseMutationOptions<TData, Error, TVariables>
    ) {
      return useMutation({
        mutationFn: async (variables: TVariables) => {
          if (method === "delete") {
            return client.del<TData>(path);
          }
          return client[method]<TData>(path, variables);
        },
        ...options
      });
    }
  };
};
