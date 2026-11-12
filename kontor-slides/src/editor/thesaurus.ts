// A small bundled thesaurus (common English words) for the Review > Thesaurus dialog.
// Each line: headword followed by its synonyms.

const DATA = `
able capable competent skilled qualified proficient
about approximately around roughly nearly concerning regarding
accept receive take admit acknowledge approve
accurate correct exact precise right true
achieve accomplish attain reach realize complete
act deed action perform behave
add append attach include increase supplement
advantage benefit asset gain edge merit
afraid scared frightened fearful nervous anxious
agree consent concur accept approve
aim goal objective purpose target intention
allow permit let enable authorize
amazing astonishing remarkable incredible wonderful stunning
angry mad furious irritated annoyed cross
answer reply response respond solution
appear seem look emerge arise show
important significant essential crucial vital key major
improve enhance better upgrade refine develop
increase raise grow expand rise boost
begin start commence initiate launch open
big large huge enormous vast great substantial
brave courageous bold fearless heroic daring
break smash fracture shatter split interrupt
bright brilliant shiny radiant vivid clever
build construct create make assemble erect
busy occupied engaged active hectic
buy purchase acquire obtain get
calm peaceful quiet tranquil serene relaxed
careful cautious attentive meticulous thorough prudent
change alter modify adjust transform vary
cheap inexpensive affordable economical low-cost
check examine inspect verify review test
choose select pick opt decide elect
clean spotless tidy neat pure clear
clear obvious plain evident transparent apparent
close shut near nearby end finish
cold chilly cool freezing icy frosty
common usual ordinary typical frequent widespread
complete finish entire whole total full
complex complicated intricate elaborate involved
concern worry issue matter interest
consider think contemplate regard ponder weigh
create make produce generate design form
danger risk threat hazard peril
dark dim gloomy shadowy black murky
decide determine resolve settle choose conclude
decrease reduce lower decline diminish drop
deep profound bottomless intense
define describe explain specify clarify
delicate fragile fine dainty subtle
describe explain portray depict detail characterize
destroy ruin wreck demolish devastate
develop grow evolve expand advance build
different distinct diverse unlike various dissimilar
difficult hard tough challenging demanding tricky
easy simple effortless straightforward basic
effect result consequence impact outcome influence
effort attempt endeavor work exertion
end finish conclusion close stop terminate
enjoy like appreciate relish savor
enough sufficient adequate ample plenty
error mistake fault flaw inaccuracy slip
example instance sample case illustration model
excellent outstanding superb exceptional great fine
explain clarify describe illustrate interpret
fair just equitable impartial reasonable
fake false fraudulent counterfeit bogus
famous well-known renowned celebrated noted
fast quick rapid swift speedy hasty
fear dread terror fright anxiety alarm
final last ultimate closing concluding
find discover locate detect uncover
fix repair mend correct restore
focus concentrate center emphasis attention
follow pursue track trail obey succeed
force power strength compel pressure
form shape structure create document
free complimentary unrestricted independent liberated
friendly kind amiable cordial warm sociable
funny amusing humorous comical hilarious witty
gain obtain acquire earn profit increase
general broad common overall universal
get obtain acquire receive gain fetch
give provide offer present grant supply
goal aim objective target purpose ambition
good fine excellent great positive pleasant
great excellent wonderful terrific superb large
happy glad joyful cheerful pleased content delighted
hard difficult tough firm solid rigid
help assist aid support serve
hide conceal cover mask obscure
high tall elevated lofty towering
honest truthful sincere frank candid genuine
idea concept notion thought plan suggestion
ignore disregard overlook neglect skip
illegal unlawful illicit forbidden prohibited
imagine envision picture visualize suppose
include contain comprise incorporate involve
interesting fascinating engaging intriguing compelling
issue problem matter concern topic edition
job work task position role duty
keep retain hold maintain preserve
kind type sort variety caring gentle
know understand realize recognize comprehend
large big huge great sizable vast
last final ultimate endure continue
late delayed overdue tardy recent
lead guide direct head conduct
learn study discover master acquire
leave depart go exit abandon quit
like enjoy appreciate similar comparable
little small tiny minor slight short
look see view watch observe glance
lose misplace forfeit drop fail
love adore cherish affection devotion
main primary chief principal major central
make create build produce form construct
many numerous several various countless multiple
mean signify indicate imply unkind average
method approach technique way procedure process
mistake error fault blunder slip oversight
modern contemporary current recent up-to-date
move shift transfer relocate motion
need require want necessity demand
new fresh novel recent modern original
nice pleasant agreeable lovely kind
normal usual regular standard typical ordinary
offer provide propose present suggest
old aged ancient elderly former vintage
open unlocked accessible begin uncovered
opinion view belief judgment position
order sequence arrangement command request
part portion piece section segment component
plan scheme strategy proposal design project
point idea argument dot tip purpose
possible feasible likely potential achievable
power strength force energy authority control
prepare ready arrange plan organize
present current gift show introduce attend
pretty attractive lovely beautiful fairly
problem issue difficulty trouble complication
produce make create generate manufacture yield
protect defend guard shield safeguard preserve
prove demonstrate show establish confirm verify
provide supply give offer furnish deliver
purpose aim goal intention reason objective
quick fast rapid swift speedy brief
quiet silent calm still peaceful hushed
rare uncommon unusual scarce infrequent
ready prepared set willing available
real actual genuine true authentic
reason cause motive explanation rationale
receive get obtain accept collect
reduce decrease lower cut lessen minimize
remove eliminate delete take away extract
reply answer respond response rejoinder
report account statement record describe
require need demand necessitate call for
result outcome consequence effect product
right correct accurate proper appropriate
safe secure protected harmless sound
same identical equal equivalent alike
say state mention declare tell remark
show display demonstrate reveal present exhibit
simple easy basic plain straightforward
slow sluggish gradual leisurely unhurried
small little tiny minor compact modest
smart clever intelligent bright sharp wise
solve resolve settle fix answer work out
special particular unique distinctive exceptional
start begin commence launch initiate open
stop halt cease end finish quit
strong powerful sturdy robust tough mighty
support help assist back aid uphold
sure certain confident positive definite
take grab seize carry accept require
talk speak converse chat discuss
team group crew squad unit
tell inform notify say explain
think believe consider suppose reflect
tired exhausted weary fatigued sleepy
true correct accurate real genuine factual
try attempt endeavor strive test
understand comprehend grasp realize follow
use employ utilize apply operate
useful helpful practical handy valuable
various diverse different assorted several
very extremely highly really truly
view opinion perspective sight outlook
want desire wish need crave
way method manner path route means
weak feeble frail fragile faint
whole entire complete total full
wide broad extensive vast wide-ranging
work job labor task effort function
wrong incorrect mistaken false inaccurate
`

const MAP = new Map<string, string[]>()
for (const line of DATA.trim().split('\n')) {
  const [head, ...rest] = line.trim().split(/\s+/)
  MAP.set(head, rest)
}

/** Synonyms for a word (headwords and reverse lookups), most direct first. */
export function synonyms(word: string): string[] {
  const w = word.toLowerCase().trim()
  if (!w) return []
  const direct = MAP.get(w) ?? []
  const reverse: string[] = []
  for (const [head, list] of MAP) if (list.includes(w)) reverse.push(head, ...list.filter((x) => x !== w))
  return [...new Set([...direct, ...reverse])].filter((x) => x !== w).slice(0, 24)
}

/** Keeps the capitalization of the word being replaced. */
export function matchCase(original: string, replacement: string) {
  if (original === original.toUpperCase() && original.length > 1) return replacement.toUpperCase()
  if (original[0] === original[0]?.toUpperCase()) return replacement[0].toUpperCase() + replacement.slice(1)
  return replacement
}
