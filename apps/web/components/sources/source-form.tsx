import { addSourceAction } from "@/app/actions";

export function SourceForm({ brainId }: { brainId: string }) {
  return (
    <form action={addSourceAction} className="space-y-3">
      <input type="hidden" name="brainId" value={brainId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <input name="title" placeholder="Investor call with..." className="field" />
        <select name="type" defaultValue="transcript" className="field">
          <option value="transcript">Transcript</option>
          <option value="email">Email</option>
          <option value="note">Manual note</option>
          <option value="document">Document</option>
          <option value="github">GitHub / product decision</option>
          <option value="strategy_output">Claude / ChatGPT output</option>
          <option value="web">Website / blog / LinkedIn</option>
          <option value="manual">Other manual source</option>
        </select>
      </div>
      <input
        name="externalUri"
        placeholder="Optional URL or Drive reference"
        className="field"
      />
      <textarea
        name="content"
        placeholder="Paste the source text here..."
        className="field min-h-56"
      />
      <button className="button">Ingest Source</button>
    </form>
  );
}
