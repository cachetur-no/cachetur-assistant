This is a user-script, it modifies other websites. Errors may occur, especially after changes on geocaching.com. You assume all risks when using this script
This script makes it easy to add caches to your trips. You can add caches directly from the map on geocaching.com, and from maps on project-gc.com.

The script is tested on the newest version of Tampermonkey and Chrome.
The Cachetur Assistant should also work with the newest version of Tampermonkey and FireFox or in other browsers TamperMonkey support (Edge, Safari, Opera Next, Dolphin and UC).

 This script will only work if you select Leaflet as your map provider on geocaching.com.
 
## Release notes

### Version 3.5.0.4
Moday 23. Jun 2021 15:01
- Fixed bug in GCLH2 warning
 
### Version 3.5.0.3
Moday 14. Jun 2021 15:15
- Added warning banner when GCLH2 is active
 
### Version 3.5.0.2
Friday 11. Jun 2021 00:45
- Fixed compatibility issue with PGC user script, and some minor GUI tweaks
 
### Version 3.5.0.1
Monday 06. Jun 2021 21:45
- Fixed issue where assistant wasn't displaying on geotours.
 
### Version 3.5.0.0
Monday 26. Apr 2021 20:50
- Fixed issue where add to trip option showed up twice
- Fixed issue with stale trip/list indication on the search map
- Compatibility fix GCLH2
- Compatibility fix geocaching.com
 
### Version 3.4.1.3
Saturday 24. April 2021 09:30
- Fixed issue where The cachetur assistant stopped working on geocaching.com after the latest changes to geocaching.com

### Version 3.4.1.2
Friday 16. April 2021 19:20
- Made Assistant compatible with GCLH2

### Version 3.4.1.1
Monday 5. April 2021 08:20
- Fixed issue where Add to trip option showed up twice, and the indication on id cache exists in trip/public list was for the previous cache on search map

### Version 3.4.1.0
Tuesday 2. Jun 2020 23:20
- Added warning when the wrong map type is selected
- Fixed issue making it impossible to add multiple caches from the new map without closing the map menu between each cache

### Version 3.4.0.0
Friday 29. May 2020 00:12
- Added support for the new search map
- Upgraded translation framework to latest version
- Update courtesy of cghove

### Version 3.3.0.2
Thursday 5. Mar 2020 22:45
- Fixed issue with the Cachetur Assistant on bookmark list pages

### Version 3.3.0.1
Monday 11. Nov 2019 23:38
- Disabled auto-refresh on mapped bookmark lists

### Version 3.3.0.0
Wednesday 23. Oct 2019 20:40
- Added support for the new geocaching.com list page

### Version 3.2.0.0
Friday 24. May 2019 00:22
- Added support for multiple languages

### Version 3.1.4.1
Wednesday 1. May 2019 00:45
- Made the Assistant work without requiring VGPS on Project-GC

### Version 3.1.4.0
Friday 26. Apr 2019 19:48
- Fixed missing activation header on the new map
- Added warning on new map, directing users to the old browse map

### Version 3.1.2.2
Sunday 24. Mar 2019 22:50
- Added automatic disabling of the Cachetur Assistant when it's not being used

### Version 3.1.2.1
Saturday 23. Feb 2019 14:38
- Added alert when not logged in on cachetur.no

### Version 3.1.2.0
Monday 11. Feb 2019 23:30
- Added button to select caches already in the trip in the PGC VGPS

### Version 3.1.1.0
Thursday 7. Feb 2019 18:15
- Added refresh of trip list to the Cachetur Assistant refresh function

### Version 3.1.0.0
Sunday 6. Jan 2019 19:15
- Added support for last edited trip templates

### Version 3.0.0.0
Sunday 6. Jan 2019 15:45
- Initial support for new geocaching.com map

### Version 2.8.8.0
Monday 28. May 2018 19:30
- Improved compatibility with Project-GC

### Version 2.8.6.0
Tuesday 22. May 2018 20:00
- Improved stability of Cachetur Assistant on Project-GC

### Version 2.8.4.0
Friday 11. May 2018 18:43
- Fixed text color on trip selector
- Added support for maps included in Project-GC challenge checkers

### Version 2.8.2.0
Thursday 10. May 2018 20:56
- Fixed support for VGPS map on Project-GC

### Version 2.8.0.0
Saturday 5. May 2018 13:46
- Made the Cachetur Assistant more compatible with other users scripts
- Changed user interface on geocache details page and geocaching map page

### Version 2.7.0.0
Tuesday 1. May 2018 01:15
- Added button to add caches from cachetur.no to the map

### Version 2.6.4.0
Sunday 29. Apr 2018 22:05
- Made the Cachetur Assistant fully compatible with the Project-GC User Script

### Version 2.6.2.0
Monday 9. Apr 2018 20:30
- Attempt to fix issues with route on PGC maps for some users

### Version 2.6.1.0
Friday 6. Apr 2018 00:18
- Added support for public bookmark lists

### Version 2.6.0.0
Thursday 5. Apr 2018 22:17
- Added support for sending caches from bookmark lists on geocaching.com to cachetur.no

### Version 2.5.0.0
Saturday 17. Mar 2018 12:50
- Added hotels and other waypoints to the route shown on the map

### Version 2.2.0.1
Monday 18. Dec 2017 19:45
- Added function to set priority

### Version 2.1.0.0
Sunday 19. Nov 2017 12:48
- Added list showing public lists and trip templates from cachetur.no on cache detail pages

### Version 2.0.0.0
Wednesday 6. Sep 2017 23:00
- First version supporting both Norwegian and English
- Full fix for changes on geocaching.com
- Added support for Project-GC VGPS

### Version 1.4.1.0
Tuesday 22. Aug 2017 08:00
- Midlertidig fiks for endringer på geocaching.com

### Version 1.4.1.0
Thursday 27. Jul 2017 22:00
- La til indikasjon i kartene på Project-GC på cacher som er lagt til i turen

### Version 1.4.0.4
Wednesday 26. Jul 2017 22:45
- Fikset feil som gjorde at det ikke var mulig å legge til cacher fra Live Map på Project-GC

### Version 1.4.0.2
Friday 21. Jul 2017 09:00
- La til manglende semikolon
- La til rette rettigheter

### Version 1.4.0.0
Thursday 20. Jul 2017 20:00
- Fikset bug som gjorde at cacher som ligger oppå hverandre på kartet på geocaching.com ikke kunne legges til i en tur
- La til visning av rute for turen (fungerer på alle kart som er støttet så langt)
- Fikset bug som gjorde at turvalg ikke ble lagret, og data ikke ble lastet før ny tur ble valgt
- La til knapp for å tvinge ny innlasting av data (rute og registrerte cacher)
- Mindre designforbedringer
- Mindre omskrivninger for å gjøre ting mer stabilt

### Version 1.2.1.1
Sunday 8. Jan 2017 22:48
- Fikset bug som gjorde at kommentarknappen aldri dukket opp

### Version 1.2.1.0
Sunday 8. Jan 2017 21:56
- Cacheturassistenten støtter nå også GeoTour-sider på geocaching.com

### Version 1.2.0.0
Saturday 7. Jan 2017 19:30
- Fjernet innsamlingslista
- Full støtte for lister
- Fikset bug som gjorde at cacheturknappen aldri dukket opp for cacher lagt til i VGPS på Project-GC.com

### Version 1.1.0.2
Saturday 16. Jan 2016 22:23
- Fikset feil som gjorde at Cacheturassistenten ikke lenger fungerte på geocaching.com

### Version 1.1.0.1
Thursday 14. Jan 2016 22:58
- La til støtte for resten av kartene på Project-GC (challenge-sjekker etc)

### Version 1.1.0.0
Thursday 14. Jan 2016 20:49
- Justeringer i layout på kartsiden på geocaching.com
- Støtte for kartverktøy under menyen "Tools" på Project-GC.com

### Version 1.0.0.54
Wednesday 6. Jan 2016 19:33
- Justeringer for å støtte nylige endringer på geocaching.com

### Version 1.0.0.53
Saturday 14. Nov 2015 19:52
- La til den nye URL-en til cachedetaljer

### Version 1.0.0.52
Thursday 22. Oct 2015 18:57
- Fikset så alle tegn kommer med i kommentarer man legger til via Cacheturassistenten

### Version 1.0.0.51
Saturday 10. Oct 2015 15:31
- Fikset så ikonet for funn av påmeldte ikke legges til mer enn en gang

### Version 1.0.0.50
Friday 9. Oct 2015 00:57
- Rettet skrivefeil
- La til funksjon som viser om noen av de som er påmeldt i en tur har funnet cachen du ser på før

### Version 1.0.0.47
Sunday 7. Jun 2015 18:05
- Versjon 1.0.0 lansert

### Version 0.46
Saturday 9. May 2015 14:51
- Forbedret kompatibilitet med andre skript

### Version 0.45
Saturday 9. May 2015 14:25
- La til indikasjon av antall cacher i tur (vises i parantes)
- Fast lengde på boksen for turvalg
- Liten justering i layout

### Version 0.44
Friday 24. Apr 2015 22:58
- Fjernet bug som la til mellomrom i coord.info-linken på detaljsiden til en cache

### Version 0.43
Wednesday 22. Apr 2015 19:19
- Knapp for å åpne tur lagt til etter turlista
- Det er nå mulig å legge til kommentarer på cacher som er lagt til i en tur (dukker opp i kommentarfeltet for veipunktet)

### Version 0.42
Wednesday 22. Apr 2015 17:25
- Skriptet har nå felles innlogging med cachetur.no, slik at du slipper å logge inn på nytt hvis du allerede er innlogget

### Version 0.41
Tuesday 21. Apr 2015 22:12
- Skriptet husker nå valgt tur

### Version 0.40
Tuesday 21. Apr 2015 20:37
- Første offentlige betaversjon
