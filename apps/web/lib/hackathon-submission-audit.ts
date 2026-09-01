import { z } from "zod";

import auditArtifact from "../../../evidence/submission/hackathon-submission-audit-2026-09-01.json";

const httpStatusSchema = z.number().int().min(100).max(599);

const auditSchema = z
  .object({
    schemaVersion: z.literal("proofera-hackathon-submission-audit-v1.0.0"),
    observedAtUtc: z.iso.datetime(),
    classification: z.object({
      boundedObservationOnly: z.literal(true),
      organizerReceipt: z.literal(false),
      submissionCompleted: z.literal(false),
      rawResponseRetained: z.literal(false),
      freshRevalidationRequired: z.literal(true)
    }),
    officialPage: z.object({
      url: z.literal("https://www.bnbchain.org/en/hackathons/smart-money-era"),
      httpStatus: z.literal(200),
      serverTimeUtc: z.iso.datetime(),
      cmsUpdatedAtUtc: z.iso.datetime(),
      title: z.literal("The Smart Money Era: Build the Era"),
      status: z.literal("Ongoing"),
      startsAtUtc: z.iso.datetime(),
      endsAtUtc: z.iso.datetime(),
      timezone: z.literal("UTC +0"),
      mainPrizeUsd: z.literal(30_000),
      submitProjectUrl: z.literal("https://forms.gle/9g9XPNFwnYaHAz9L8"),
      mainTrack: z.object({
        categories: z.tuple([
          z.literal("Rebalancing"),
          z.literal("Grid Trading"),
          z.literal("Yield Optimisation"),
          z.literal("Health Factor Monitoring")
        ]),
        journey: z.tuple([
          z.literal("land"),
          z.literal("find"),
          z.literal("understand"),
          z.literal("activate")
        ]),
        functionalAndPublicDuringJudgingRequired: z.literal(true),
        agentsLiveOnBscRequired: z.literal(true)
      }),
      altana: z.object({
        testnetAccepted: z.literal(true),
        walletAddressesRequestedInSubmission: z.literal(true),
        requirements: z.array(z.string().min(1)).length(5)
      }),
      termix: z.object({
        reportTaskPairsMinimum: z.literal(3),
        highStakesTaskMinimum: z.literal(1),
        requiredMeasures: z.tuple([
          z.literal("time"),
          z.literal("cost"),
          z.literal("output quality"),
          z.literal("actual outputs")
        ]),
        weightsPercent: z.object({
          serviceValue: z.literal(30),
          provenAgentAdvantage: z.literal(30),
          highStakesAndTrackRecord: z.literal(20),
          marketplaceQuality: z.literal(20)
        })
      }),
      pancakeSwap: z.object({ realBenefitRequired: z.literal(true), prizeCake: z.literal(1000) })
    }),
    linkedForm: z.object({
      title: z.literal("Build the Era Hackathon Registration"),
      shortUrl: z.literal("https://forms.gle/9g9XPNFwnYaHAz9L8"),
      resolvedUrl: z.url(),
      httpStatus: z.literal(200),
      availabilityJudgingEndDateUtc: z.literal("2026-09-23"),
      fields: z.array(z.string().min(1)).min(20),
      trackOptions: z.tuple([
        z.literal("PancakeSwap"),
        z.literal("AltLayer"),
        z.literal("TermiX"),
        z.literal("Not sure")
      ]),
      projectFieldsPresent: z.literal(true),
      githubFieldPresent: z.literal(true),
      payoutWalletFieldPresent: z.literal(true),
      additionalNotesFieldPresent: z.literal(true),
      publicProductFieldPresent: z.literal(false),
      demoFieldPresent: z.literal(false),
      evidenceFieldPresent: z.literal(false),
      altanaTrackOptionPresent: z.literal(false)
    }),
    candidateObservation: z.object({
      publicProduct: z.object({
        url: z.literal("https://proofera.tangvu.dev"),
        build: z.string().regex(/^[0-9a-f]{40}$/u),
        routeHttpStatus: z.object({
          home: z.literal(200),
          marketplace: z.literal(200),
          studio: z.literal(200),
          sessionControl: z.literal(200),
          missionControl: z.literal(200),
          proofRoom: z.literal(200),
          health: z.literal(200),
          readiness: z.literal(503)
        }),
        readiness: z.object({
          status: z.literal("not_ready"),
          readyForJudging: z.literal(false),
          readyForActivation: z.literal(false),
          activation: z.literal("unavailable")
        })
      }),
      publicAgentCardHttpStatus: z
        .record(z.string(), httpStatusSchema)
        .refine(
          (statuses) => Object.values(statuses).length === 4,
          "Exactly four public Agent Card observations are required."
        ),
      sourceRepository: z.object({
        url: z.literal("https://github.com/tang-vu/proofera-bnb"),
        authenticatedVisibility: z.literal("PRIVATE"),
        anonymousPageHttpStatus: z.literal(404),
        anonymousApiHttpStatus: z.literal(404),
        anonymousRawReadmeHttpStatus: z.literal(404),
        anonymousRawFinalVideoHttpStatus: z.literal(404),
        publicSourceVerified: z.literal(false)
      })
    })
  })
  .strict();

export const hackathonSubmissionAudit = Object.freeze(auditSchema.parse(auditArtifact));
