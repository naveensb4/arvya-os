export function AskForm({
  brainId,
  defaultQuestion,
}: {
  brainId: string;
  defaultQuestion?: string;
}) {
  return (
    <form className="flex flex-col gap-3 sm:flex-row" method="get">
      <input
        type="hidden"
        name="brainId"
        value={brainId}
      />
      <input
        name="q"
        defaultValue={defaultQuestion}
        placeholder="What are the highest-priority open loops?"
        className="field"
      />
      <button className="button">Ask</button>
    </form>
  );
}
