# Find Me Home

Find Me Home supports a household in collecting, comparing, and visiting land
they may want to buy.

## Language

**Source Listing**:
A household record of an advertisement published by a property marketplace.
One Source Listing may offer one or more Candidate Plots; after an explicit
merge, the canonical survivor retains prior marketplace identities as history.
_Avoid_: Listing, property

**Candidate Plot**:
A distinct purchasable option the household is considering. It may correspond
to one Registered Parcel, several parcels sold together, or land that has not
yet been registered separately.
_Avoid_: Listing, property

**Plot Component**:
One constituent piece of land in a Candidate Plot. It records the advertised
land identity and may resolve to no Registered Parcel, part of one, or one whole
Registered Parcel.
_Avoid_: Parcel, plot

**Plot Component Resolution**:
The current relationship between a Plot Component and official land records:
unresolved, provisional, confirmed, or not separately registered.
_Avoid_: Parcel match, guessed parcel

**Candidate Plot Disposition**:
The household's current conclusion about a Candidate Plot: considering,
dismissed, or acquired. A disposition may be corrected without discarding the
plot's history.
_Avoid_: Status, planned, visited

**Offering Availability**:
Whether a Candidate Plot is currently offered by its Source Listing: available,
withdrawn, or unknown. It is independent of the household's disposition.
_Avoid_: Candidate Plot Disposition, marketplace availability

**Registered Parcel**:
An officially registered area of land with authoritative identity and
geometry. A Candidate Plot's relationship to a Registered Parcel may be
confirmed, provisional, or absent.
_Avoid_: Plot, listing

**Household Scorecard**:
The household's single shared set of criteria for comparing Candidate Plots.
Its guidance informs choices but never makes a Candidate Plot ineligible.
_Avoid_: Eligibility rules, per-plot scorecard

**Criterion**:
A configurable aspect of Candidate Plots that the household wants to compare.
It may provide advisory threshold guidance, contribute to preference scoring,
or supply unscored context.
_Avoid_: Hard constraint, requirement

**Evaluation**:
An explainable assessment of one Candidate Plot against a household criterion,
including its effective value, evidence, confidence, and last-updated time.
_Avoid_: Badge, verdict

**Visit**:
A dated record of the household inspecting the offering represented by a
Source Listing in person. A Source Listing may have more than one Visit.
_Avoid_: Visited flag

**Visit Plan**:
A single saved, ordered list of distinct Source Listings the household intends
to inspect. The household has only one active Visit Plan.
_Avoid_: Route

**Source Listing Activity**:
The chronological history retained for a Source Listing, including comments,
photos, and Visits.
_Avoid_: Candidate Plot notes, Visit notes
