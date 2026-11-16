# Occlusion Lab: clinical assumptions for review

For Swapnil to check. Each line says what the model does now, where it lives in the code, and what to confirm. Nothing here is clinical advice; the app is a teaching model, not for clinical use.

## Articulator settings

1. **Angles are measured from the occlusal plane, not Frankfort horizontal.** Condylar inclination, Bennett angle and the incisal guide table angle are all relative to the model's occlusal plane (world y = up). Real articulator values from a protrusive record are usually read against Frankfort (or the axis-orbital plane), which sits roughly 7 to 10° steeper than the occlusal plane, so the numbers in the app are not directly interchangeable with a lab sheet. The Articulator tab says this in its hint. *(engine.js, `condyles()`)* **Check:** is "relative to the occlusal plane" acceptable for teaching, or should the sliders be relabelled or offset to Frankfort?

2. **One incisal table angle for every direction.** The incisal pin follows a single guide-table angle based on its horizontal distance from centric, so protrusive and lateral wings are the same steepness. There are no separate lateral wing angles. *(engine.js, `tableTheta()`)* **Check:** fine for teaching, or add separate protrusive and lateral wing settings?

3. **No immediate side shift.** The orbiting (non-working) condyle moves along a straight path set by the condylar inclination and the Bennett angle (progressive side shift only). The working condyle shifts outward just enough to keep the intercondylar distance fixed. *(engine.js, `condyles()`)* **Check:** acceptable to omit ISS? It would add a "Bennett movement" slider in mm.

4. **Gothic arch apex direction: please confirm.** By default the panel draws the *path of the point* (incisal point or central bearing point) seen from above, anterior up: CR sits at the apex at the bottom and the lateral arms open forward and outward. "Plate on lower ⇅" instead draws what a stylus on the upper member would scratch on a plate carried by the mandible, which flips the figure so the apex points forward (CR at the top). *(main.js, `drawGothic()`)* **Check:** that the flipped (plate) version matches the intraoral tracing you would show students (apex pointing anteriorly), and that Pt R / Pt L sit on the correct sides in both versions.

## Casts and centric

5. **Upper anteriors seated to light contact.** Upper posteriors are dropped vertically onto the lower arch; upper incisors are moved horizontally (labio-lingually) until they just touch (about 0.02 mm gap) while keeping the designed overbite. Upper canines get a set vertical overlap. Resulting model: overbite about 1.9 mm, overjet about 1.9 mm, canine overlap 2.8 mm, Class I molar and canine. *(model.js, `buildModel()`)* **Check:** are 8 anterior teeth marking in centric (24 teeth marking in all) acceptable, or should anteriors clear slightly in MIP (for example 10 to 20 µm, so they only mark on firm closure)?

6. **Upper incisor shape (cosmetic).** Upper centrals and laterals now taper toward the cervix and have rounded incisal corners (distal more rounded than mesial, laterals more than centrals). Guidance behaviour was checked unchanged after this change. **Check:** that they read as upper incisors from the front.

## Contacts

7. **Vertical gap with a normal correction.** The gap between the arches is measured vertically (upper surface minus lower surface at the same x, z), then scaled by the surface normal so sloped cusp inclines are not under-reported. A vertex marks when its gap is under the paper thickness (default 100 µm); "darker core" means under 35% of that. *(engine.js, gap solve; main.js, `paint()`)* **Check:** good enough as a stand-in for true closest-surface distance?

8. **Mark halos and contact pins are display aids.** Each mark has a pale halo one mesh step wide, and live contacts get an outlined pin in the 3D view at the centroid of that tooth's touching area. The real contact is only the saturated core. Both can be switched off in the Articulator tab.

## What the default model shows (average values: condylar 30°, Bennett 15°, table 10°, teeth guide on)

9. **Protrusive: posterior contact appears at about 3.5 mm.** Up to 3 mm (the Protrusive button) incisors 11, 21, 31, 41 (plus 32, 42) guide and posteriors clear by about 0.2 mm. From about **3.5 mm** forward, first premolars **34 and 44 touch the upper canines 23 and 13** and the app flags a protrusive posterior interference. (The brief said "beyond about 4 mm"; in the current model it starts a little earlier, at 3.5 mm.) **Check:** is a 34/44 against 13/23 contact at 3.5 to 4 mm protrusion believable, or should the canine or premolar be adjusted so it starts later?

10. **Lateral: crossover past about 5 mm.** At 3.5 mm right or left lateral, the working canines (13/43 or 23/33) guide with no non-working contacts (canine guidance, pin lifts about 1.3 mm). Past about 5 mm the canines pass cusp tip to cusp tip and the lateral incisors take over ("Incisor guidance"). **Check:** crossover distance and which teeth take over.

11. **A balancing interference appears only with flat paths.** With average or steep condyles, no non-working contacts appear. With the "Flat paths, table only" quick setup (condylar 5°, Bennett 15°, table 0°, teeth guide off) a right lateral flags a working-side interference (44, 46, 47), a non-working interference (24 to 27, 35 to 37) and overlap of about 1.7 mm. With condylar 20°, table 15° and teeth guide off it is canine guidance with no balancing contact at 3.5 mm, but a balancing contact appears earlier in the movement (about 2 mm). **Check:** that this matches what you want students to learn about condylar inclination and balancing interferences.

12. **Chewing cycle** is a schematic frontal tear-drop: open slightly to the balancing side, swing to the working side, close into a lateral position, glide back to centric. Two strokes each side. Not a recorded human trajectory.
