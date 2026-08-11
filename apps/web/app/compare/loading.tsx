import { LiveEvidenceLoading } from "../live-evidence-loading";

export default function ComparisonLoading() {
  return (
    <LiveEvidenceLoading
      detail="Fetching each selected identity at the same decision boundary before showing evidence gaps side by side."
      title="Loading selected evidence."
    />
  );
}
