#Madro

Fredag morgen ved I, hvad I skal spise hele ugen.
En madplansapp til familier, der samler ugens plan, indkøb, køkken og madbudget ét sted.

Indhold
Hvad er Madro?
Status
Kom i gang
Mappestruktur
De fire universer
Sådan fungerer planen
Hvem er Madro til?
Skærmoversigt
Brand
Bevægelse og grafik
Tilgængelighed
Forretningsmodel
Roadmap
Teknisk retning
Åbne punkter
Licens
Hvad er Madro?
De fleste familier ved godt, hvad de burde spise. Det svære er at få planen til at passe med kalenderen, budgettet, det der ligger i køleskabet, og ugens tilbud. Det er tit en opgave, der hænger på én person.

Madro laver ugens madplan for hele husstanden. Den tager højde for:

kalenderen, så travle aftener får hurtige retter, og fridage får mere tid;
budgettet, så planen holder sig inden for madpengene for resten af perioden;
tilbud fra butikkerne, så de billige varer bliver brugt;
kvitteringer og lager, så det, der allerede er købt, bliver spist;
præferencer og kostregler for hver person i husstanden.
Ud fra planen kommer en indkøbsliste sorteret efter butikkens gange, en kogeguide trin for trin og et ugebrev, der samler det hele.

Status
Madro er på konceptstadiet. Repositoriet rummer:

Del	Version	Beskrivelse
Prototype	v16	Klikbar hi-fi-prototype i én HTML-fil med 40+ skærme, lys og mørk tilstand og fuldt bevægelsessprog
Pitch	v16	Præsentation af problem, løsning, målgruppe, forretningsmodel, roadmap og bevægelsessprog
Brand	1.0	Endeligt logo i alle varianter, farvepalet og typografi
Der er endnu ingen backend. Al data i prototypen er eksempeldata.

Kom i gang
Der skal ikke installeres noget. Filerne er selvstændige HTML-sider.

git clone https://github.com/sibar84/madro.git
cd madro
open prototype/index.html   # macOS – brug xdg-open på Linux eller start på Windows
Hver skærm i prototypen kan åbnes direkte med et #id i adressen, fx prototype/index.html#ugen eller #indkob. Se Skærmoversigt.

I prototypens sidepanel kan du:

skifte mellem lys og mørk tilstand;
se appen som fire forskellige husstande ("Vis som");
afspille splash-skærmen og fredagsmomentet "Ugen er klar";
se tomme tilstande for de vigtigste skærme.
Del via GitHub Pages
Slå GitHub Pages til under Settings → Pages med kilden main / rod. Så ligger prototypen på https://sibar84.github.io/madro/prototype/ og pitchen på https://sibar84.github.io/madro/pitch/. Bemærk, at Pages-sider er offentlige, også fra et privat repository på de fleste planer.

Mappestruktur
madro/
├── prototype/
│   └── index.html      Klikbar prototype (HTML, CSS og JS i én fil)
├── pitch/
│   └── index.html      Pitch-præsentation
├── brand/
│   └── logo/           Logo, ordmærke, symbol og app-ikon (SVG + PNG)
└── README.md
De fire universer
Appen er delt i fire universer. Hvert univers har sin egen markørfarve, som kun vises som en lille prik over fanen og en flise i toppen. Den farver aldrig hele skærmen.

Univers	Markør	Indhold
Plan	dild-grøn	I dag, ugen, næste uge, ønsker, spisetider, kalender
Indkøb	sennep	Indkøbsliste, butikstur, tilbud, tilbudsovervåger, faste varer, online-bestilling
Køkken	blæk	Opskrifter, kogeguide, lager, rester, oprydning
Økonomi	fjord-blå	Madbudget, madkonto, kvitteringer, scanning
Sådan fungerer planen
Rytme. Tilbudsaviser hentes kl. 06. Næste uges plan er klar fredag kl. 07 og træder i kraft lørdag kl. 07, også uden at nogen godkender den. Kalenderne tjekkes hvert kvarter.
Planperiode. En plan kan dække 1, 2 eller 4 uger, så der også kan købes stort ind til fryseren.
Budget. Madpengene sættes pr. måned (fx 5.432 kr.) og følger lønningsdagen. Til- og fradrag (fx +1.000 kr. fra mormor eller −399 kr. til en regning) retter både budgettet og madkontoens saldo. Planen holder sig altid inden for det resterende budget fordelt på de resterende dage. Overalt i appen vises ét ugebudget som ugens ramme.
Spisetider. Spisetider sættes for hverdage, fredage og weekender, med en buffer. Appen giver besked, når det er tid til at gå i gang.
Rester. Dagen før en restedag laves der mad til begge dage. Mængder og indkøbsliste regnes op automatisk.
Når planen ikke holder. "Holder det ikke?" på I dag åbner ét ark med de typiske årsager: syge børn, overarbejde, en vare der er udsolgt, gæster og andre. Madro foreslår så en løsning, der stadig passer i ugen.
Udsolgt. I butikken kan en vare markeres som udsolgt, og Madro foreslår et alternativ med det samme.
Hvem er Madro til?
Datamodellen understøtter seks husstandstyper fra start, fra én person til et kollektiv. Prototypen kan vises som fire eksempelhusstande:

Husstand	Hvad den viser
Familien Holm	Børnefamilie med travl kalender, flere præferencer og stramt budget
Mikkel	Bor alene og vil have en enkel plan uden madspild
Grethe + hjælper	Ældre bruger med hjælper, store knapper og Enkel tilstand
Kollektivet	Mange voksne, madhold, tilmelding og delt madkonto
Roller: ejer, voksen, barn, gæst og hjælper. Kostregler findes i tre styrker: allergi (aldrig), undgå og foretrækker. Sprog vælges pr. person, og både dansk og engelsk er med ved lancering.

Skærmoversigt
Alle skærme med deep-link-id

Område	Skærme (#id)
Opstart	onbStart (Hvem er I?), onb0, onbInv, onbPartner, onb1, onb2, onb3, onbConn, onbAuto
Plan	idag, ugen, naesteuge, onsker, kalender, spisetider, ret
Indkøb	indkob, butik, tilbud, overvag, fastevarer, butikker, online
Køkken	opskrifter, opskriftNy, koge, lager, oprydning, madhold
Økonomi	okonomi, budget, kvitteringer, scan
Husstand og indstillinger	familie, praef, sprog, enkel, auto, konto, beskeder, mere
Brand
Madro-symbolet Madro app-ikon

Logo. Rødbeden "Bladet ud til siden" har en bred knold, en udstanset ring, en tynd krøllet hale, én rød stilk og et stort dildblad med rød ribbe. Under 24 px bruges en forenklet lille udgave uden ribbe. Ordmærket må ikke skrives af; brug altid filerne i brand/logo.

Farver: palet B "Rugbrød og rødbede".

Navn	Lys	Mørk	Brug
Kerne	#F3EEE4	#1C1410	Baggrund
Rugbrød	#2B1D17	#F3EEE4	Tekst
Skorpe	#E9D8C4	–	Flader og kort
Rødbede	#8E1B42	#E8789A	Primær handling (højst én pr. skærm)
Dild	#4F6E32	#A9C27F	Plan-markør, bekræftelse
Sennep	#E6B640	–	Kun Indkøb-markør; som tekst #8A5A00
Fjord	#2B5C8F	–	Kun Økonomi-markør
Regler

Der må højst være ét rødbede-element pr. skærm.
Grøntsagsfarverne (gulerod, tomat osv.) bruges kun i illustrationer og tallerkener, aldrig i knapper eller tekst.
Sennep bruges aldrig som tekstfarve.
Typografi. Bricolage Grotesque 700 bruges til overskrifter og store tal. Til resten bruges systemfonten, og Inter til tryk.

Bevægelse og grafik
Signaturen er ringen i rødbeden. Den går igen i:

splash-skærmen, hvor logoet vokser, og kameraet glider gennem ringen ind på I dag;
timere og spinnere, som er tegnet som ringen;
"Ugen er klar", fredagsmomentet, hvor syv grøntsagssnit lægger sig som ugens dage.
Skift mellem universer sker uden farvebølge, men med en ikonmorf, en tone på 4 %, et glid og prikken over fanen.

Illustrationssproget "Snit" bygger på cirkel, ring, blad, streg og snit. Tegningerne er flade, har højst tre farver og har ingen ansigter. Retterne vises som genererede snit-tallerkener i stedet for madfotos, og tomme tilstande har deres egne snit-illustrationer.

Tilgængelighed
Alle animationer respekterer prefers-reduced-motion og kan afbrydes med et tryk.
Prototypen virker i lys og mørk tilstand og i 390 px bredde.
Der er labels til VoiceOver, og indtastning kan ske med stemmen.
Enkel tilstand har store knapper og færre valg og er tænkt til ældre brugere og hjælpere.
Forretningsmodel
Gratis for én person: madplan, indkøbsliste og tilbud fra alle butikker.
Gratis for husstande med flere: madplan og delt indkøbsliste med tilbud fra én butik.
Betalt (39 kr./md., 30 dages gratis prøve): alle butikker, kalenderregler, kvitteringer, økonomi og ugebrev. Kontosiden viser, hvad Madro har sparet familien, så prisen kan holdes op mod besparelsen.
Roadmap
MVP (lancering)

Ugeplan med kalender, budget og tilbud
Indkøbsliste og butikstur med Udsolgt
"Hvem er I?" med husstandstyper, udstyr og budget fra 0 kr.
"Holder det ikke?" med akutløsninger
Roller inkl. gæst og hjælper, kostregler i tre styrker
Dansk og engelsk
V2

Lager og personvarianter af retter
Enkel tilstand fuldt udbygget
Madhold og tilmelding
Flere måltider om dagen, herunder ramadan
Næringsdata
Arabisk
Flere butikker i samme plan
Samvær (børn, der bor to steder)
Teknisk retning
Det er et forslag og er ikke besluttet endnu:

App: Expo (React Native) i TypeScript til iOS, Android og web
Backend: TypeScript-monolit med Postgres hostet i EU
Planlægning: regelmotor til at lægge planen
Data: licens til tilbudsdata skal være på plads, før udviklingen starter
Åbne punkter
Navn: "Madro" bruges også af en bog fra 2020 og af MadroInstituttet ApS. En advokat bør se på det før lancering, og der mangler en DKPTO/EUIPO-søgning.
Logo: kurverne mangler renskrivning af en grafiker, og der skal laves en genkendelsestest med fem personer.
Tilbudsdata: aftale om licens mangler.
Licens
© 2026 Silas. Alle rettigheder forbeholdes. Indholdet, herunder logo og brand, må ikke bruges, kopieres eller distribueres uden skriftlig tilladelse.
