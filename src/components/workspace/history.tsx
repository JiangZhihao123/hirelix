"use client";
import { Dialog, ErrorNotice, Loading, date, useQuery } from "./client";
export function History({
  kind,
  id,
  onClose,
}: {
  kind: "person" | "role" | "record" | "deliverable";
  id: string;
  onClose: () => void;
}) {
  const query = useQuery<{
    versions: Array<{
      version: number;
      created_at: string;
      snapshot: Record<string, unknown>;
    }>;
  }>(`/versions?kind=${kind}&id=${id}`);
  return (
    <Dialog title="Version history" onClose={onClose} wide>
      <div className="ws-history">
        <ErrorNotice error={query.error} retry={query.refresh} />
        {query.loading ? (
          <Loading />
        ) : (
          query.data?.versions.map((item) => (
            <details key={item.version}>
              <summary>
                Version {item.version} · {date(item.created_at, true)}
              </summary>
              <div className="ws-section">
                {Object.entries(item.snapshot)
                  .filter(
                    ([key]) =>
                      ![
                        "id",
                        "user_id",
                        "source_candidate_id",
                        "source_search_id",
                        "source_evidence",
                        "created_at",
                        "updated_at",
                        "version",
                      ].includes(key),
                  )
                  .map(([key, value]) => (
                    <div key={key} className="mb-3">
                      <h3>{key.replaceAll("_", " ")}</h3>
                      {typeof value === "string" ? (
                        <p>{value}</p>
                      ) : Array.isArray(value) &&
                        value.every((item) => typeof item === "string") ? (
                        <p>{value.join(", ")}</p>
                      ) : (
                        <pre>{JSON.stringify(value, null, 2)}</pre>
                      )}
                    </div>
                  ))}
              </div>
            </details>
          ))
        )}
      </div>
    </Dialog>
  );
}
