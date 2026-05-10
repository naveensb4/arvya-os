import { redirect } from "next/navigation";
import { getOnboardingState } from "./actions";
import { CreateBrainStep } from "./create-brain-step";
import { ConnectSourcesStep } from "./connect-sources-step";
import styles from "./page.module.css";

export default async function OnboardingPage() {
  const state = await getOnboardingState();

  if (state.step === "auth") redirect("/login");

  const step = state.step === "create" ? 1 : 2;
  const connected = state.connected ?? [];

  return (
    <div className={styles.stage}>
      <aside className={styles.rail}>
        <div className={styles.brand}>
          <span className={styles.brandMk}>A</span>
          <span className={styles.brandWord}>ARVYA</span>
        </div>

        <h1>Set up your brain.</h1>
        <p className={styles.lede}>
          Two steps. Name it, connect your sources, and Arvya starts
          building context from everything it reads.
        </p>

        <div className={step >= 1 ? `${styles.step} ${styles.stepOn}` : styles.step}>
          <span className={styles.stepN}>{step > 1 ? "✓" : "1"}</span>
          <div>
            <div className={styles.stepTtl}>Create your brain</div>
            <div className={styles.stepDesc}>
              {step > 1 ? "DONE" : "NAME + PURPOSE"}
            </div>
          </div>
        </div>

        <div className={step >= 2 ? `${styles.step} ${styles.stepOn}` : styles.step}>
          <span className={styles.stepN}>{connected.length > 0 ? "✓" : "2"}</span>
          <div>
            <div className={`${styles.stepTtl} ${step < 2 ? styles.stepTtlDim : ""}`}>
              Connect sources
            </div>
            <div className={styles.stepDesc}>
              {connected.length > 0
                ? `${connected.length} CONNECTED`
                : "GMAIL + SLACK"}
            </div>
          </div>
        </div>

        <div className={styles.railFoot}>
          READ-ONLY BY DEFAULT &middot; NO TRAINING ON YOUR DATA
        </div>
      </aside>

      <div className={styles.screen}>
        {step === 1 ? <CreateBrainStep /> : null}
        {step === 2 && state.brainId ? (
          <ConnectSourcesStep brainId={state.brainId} connected={connected} />
        ) : null}
      </div>
    </div>
  );
}
