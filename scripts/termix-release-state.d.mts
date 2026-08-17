export interface TermixReleaseStateOptions {
  readonly repositoryRoot: string;
  readonly sourceCommitSha: string;
  readonly protectedPaths: readonly string[];
  readonly errorPrefix: string;
}

export function verifyTermixPublishedReleaseState(options: TermixReleaseStateOptions): void;
