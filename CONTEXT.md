# Find Me Home

Find Me Home supports a household in collecting, comparing, and visiting land
they may want to buy.

## Language

**Household**:
The shared workspace for one land search: its Source Listings, Candidate
Plots, and Visit Plan. Everyone who has joined a Household sees and may edit
all of it; there are no roles, permissions, or member identities. A person may
participate in several Households.
_Avoid_: Group, account, workspace

**Source Listing**:
A household record of an advertisement published by a property marketplace.
One Source Listing may offer one or more Candidate Plots.
_Avoid_: Listing, property

**Candidate Plot**:
A distinct purchasable option the household is considering. It may correspond
to one Registered Parcel, several parcels sold together, or land that has not
yet been registered separately.
_Avoid_: Listing, property

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

**Recorded Location Clue**:
An address, coordinate pair, or unique parcel number imported or entered for a
Candidate Plot. Clues are preserved as entered even when another clue determines
the plot's Effective Location.
_Avoid_: Override, confirmed location

**Effective Location**:
The location used to display and evaluate a Candidate Plot. It comes from the
first successfully resolved Recorded Location Clue in this order: unique parcel
number, coordinates, then address.
_Avoid_: Recorded Location Clue, override

**Resolved Location Data**:
Coordinates, address, or boundary derived automatically from a Candidate Plot's
Effective Location. It does not replace its Recorded Location Clues.
_Avoid_: Override, household-entered location

**Automatic Check**:
An automatically calculated fact or advisory pass, warning, fail, or unknown
result for a Candidate Plot. Automatic Checks are independent and do not form a
weighted score or rank.
_Avoid_: Score, verdict, requirement

**Manual Rating**:
The household's optional five-star judgment of one aspect of a Candidate Plot:
road/access, area feeling, or view.
_Avoid_: Automatic Check, Visit rating

**Visit**:
The most recent time the household marked a Source Listing as visited. Marking
it visited removes it from the Visit Plan; it may later be added again.
_Avoid_: Candidate Plot visit, visit history

**Visit Plan**:
A single saved, ordered list of distinct Source Listings the household intends
to inspect. The household has only one active Visit Plan and may reorder it at
any time, including while visiting listings.
_Avoid_: Route
