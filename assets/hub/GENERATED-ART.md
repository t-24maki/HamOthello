# トップ紹介イラスト：みんなで遊ぶ場面

制作日：2026-11-08。内蔵 image_gen（imagegen スキル）で既存カードの絵を再構成。採用 WebP はこのフォルダー、生成原寸PNG・元カードの控え・検証記録は `/Users/t.nishimaki/Documents/Codex.nosync/たくめぐ/work/2026-11-08/hub-play-scenes/` に保存する。

参照2は `baccarat/art/table-friends-v3.png`（4キャラの体形・色・たぴの無表情）、参照3は `gyoza/art/hamsters-play-v1.png`（表情と線）。参照1は作業前の各カードをブラウザーで記録したPNG。既存の原画は編集しない。

先行6枚の送信プロンプトは以下の共通文＋該当する Scene。追加4枚は末尾に別記。透過指定は false。

## 採用ファイル

| ゲーム | ファイル | 背景 |
|---|---|---|
| たくめぐのおさんぽ | [sanpo-play-v1.webp](sanpo-play-v1.webp) | 木漏れ日の森・小道 |
| たくめぐのぽよんバトル | [battle-play-v3.webp](battle-play-v3.webp) | コーラルの夕焼け・紫の足場 |
| ぷにっとオセロ | [othello-play-v2.webp](othello-play-v2.webp) | 若葉色・葉の影 |
| たくめぐしょうぎ | [shogi-play-v2.webp](shogi-play-v2.webp) | 琥珀色・畳 |
| ミニルーレット | [roulette-play-v2.webp](roulette-play-v2.webp) | ローズ・淡い光 |
| ミニまーじゃん | [mahjong-play-v2.webp](mahjong-play-v2.webp) | 翡翠色・格子 |
| ブロックつめこみ | [blocks-play-v2.webp](blocks-play-v2.webp) | 藤青色・ブロック模様 |
| まんまるビリヤード | [billiards-play-v2.webp](billiards-play-v2.webp) | 深めの青緑・柔らかな照明 |
| たべものしりとり | [shiritori-play-v1.webp](shiritori-play-v1.webp) | 桃色・ピクニックのチェック |
| じんとりがっせん | [jintori-play-v1.webp](jintori-play-v1.webp) | 4色の地面・池 |
| ミニポーカー | [poker-play-v3.webp](poker-play-v3.webp) | くすんだ青・ひし形 |
| たくめぐすごろく | [sugoroku-play-v3.webp](sugoroku-play-v3.webp) | 青空・草地 |
| たくめぐぎょうざ | [gyoza-play-v1.webp](gyoza-play-v1.webp) | クリーム・セージの食卓 |
| クイズ・めぐハムア | [quiz-play-v4.webp](quiz-play-v4.webp) | プラム色の舞台・金の円形ロゴ |

## 共通プロンプト

```text
Use case: illustration-story. Edit image 1 (the existing website game-card picture) into a finished narrative illustration, preserving the game identity but replacing the sparse board-and-floating-icons composition. Images 2 and 3 are CHARACTER/STYLE REFERENCES ONLY, not layouts to copy. Deliver ONE clean wide 2:1 landscape illustration (1536x768 if possible), no collage, no multiple panels, no UI. Same friendly TAK&MEG picture-book style as the supplied characters: clean warm-brown outlines, rounded chubby head-and-body silhouette, tiny paws and feet, soft flat pastel shading, gentle facial expressions, slight handmade charm. The lavender hamster Taku ALWAYS has round brown glasses. The cream hamster Megu has four short curved forehead marks. Never depict them as detached face icons: show their little bodies and hands actively interacting with the game. Keep them recognizable from the reference sheets, not generic bears/mice. Keep all characters and important objects within the central 85% of the canvas with breathing room. Simple warm ivory/pastel backdrop, a soft ground shadow, no busy room, no hard rectangular border. View from a slightly elevated three-quarter angle, so we see both faces and the playing surface. Characters should be large, approximately as tall as the tabletop is wide, with the game as the shared focus. No titles, explanatory text, rules, speech bubbles, logos, watermarks or annotation arrows. No photorealism, no glossy 3D, no extra limbs, no human fingers. Do not copy the dark background or grid layout of the reference sheets.
```

## othello-play-v1.webp

```text
Scene: Two hamsters only, Taku and Megu, sitting at opposite sides of a low wooden green Othello board. Taku thoughtfully places one purple disc with a small paw; Megu leans forward with an amused, pleased expression and holds one cream disc. Several purple and cream discs in a plausible mixed mid-game arrangement on an 8x8 grid, not a full board. A couple of reserve discs beside the board. The two full-body players interacting are the main visual story; board occupies the lower middle. Sage green and warm cream accent palette.
```

## shogi-play-v1.webp

```text
Scene: Two hamsters only, Taku and Megu, sitting across a small warm wooden 4-by-4 mini shogi board. Megu uses a tiny paw to move a pentagonal wooden piece; Taku adjusts his round glasses with one paw while thinking and looking at the board. Pieces have simple tiny hamster / pink tapi blob / crown picture emblems, NOT Japanese characters or written instructions. A few spare pieces on a little tray. Show a playful friendly tactical moment, full small bodies visible beside the board. Soft honey, ivory and lavender palette.
```

## roulette-play-v1.webp

```text
Scene: All FOUR distinct reference characters gather around one low round roulette table: lavender Taku with round glasses, cream Megu with four forehead marks, orange Normal Ham wearing his BLUE SUMO MAWASHI belt, and small smooth pink Tapi with dot eyes, a straight horizontal neutral mouth, two tiny hands and little feet, NO EARS. No duplicates. Show Taku gently releasing a small ball into the wheel while Megu and orange Ham watch excitedly; Tapi watches with the unchanged deadpan face. The mini roulette wheel has six alternating muted red and dark charcoal radial wedges around a green center, and a few gold play chips on the table. No written numbers needed. A single lively but gentle shared activity, not casino glamour. Muted sage, gold, lavender and cream.
```

## mahjong-play-v1.webp

```text
Scene: Two hamsters only, lavender glasses-wearing Taku and cream Megu, playing mini mahjong at a low sage-green felt table. Taku holds a single ivory tile thoughtfully near his face, Megu is putting down one tile with a delighted tiny smile. Each has a SHORT row of nine chunky ivory tiles, with small lavender hamster, cream hamster or pink neutral Tapi picture motifs and simple pip motifs, not Chinese writing. A few face-up discards in the center. Their full little bodies are visible at opposite sides. Focus on friendly interaction and readable tile shapes, never a diagram of scoring groups. Absolutely no explanatory words or captions anywhere. Sage green and warm ivory palette.
```

## blocks-play-v1.webp

```text
Scene: Two hamsters only, lavender Taku with round glasses and cream Megu with forehead marks, puzzling together over a low square wooden 8-by-8 grid board. Taku uses one paw to rotate a chunky lavender L-shaped polyomino above a gap, while Megu points with a tiny paw at a promising space, smiling. On the board are a few lavender and honey-yellow L, T, square and zigzag shapes with several empty squares remaining, plus two small dark obstacle squares. Some spare blocks beside them. Full-body characters are part of the same scene as the board, not portrait icons. Cozy cream and soft lavender palette.
```

## billiards-play-v1.webp

```text
Scene: Two hamsters only, lavender Taku with round glasses and cream Megu with four forehead marks, playing on a ROUND small green billiards table with a honey-colored wooden rim and six dark pockets spaced around the rim. Taku stands on the left, leaning in with a cue held naturally by two tiny paws, aiming at a white cue ball. Megu stands on the right and watches warmly with a small cue resting beside her. Use only lavender balls, pale cream balls and a single white cue ball, no numbers. Make the round shape unmistakable in slight three-quarter perspective; show both characters' whole chubby bodies beside it. Friendly playful game, no competitive sports glamour. Mint, ivory and lavender palette.
```


## しょうぎの最終調整

2つのたぴの駒絵の口だけを無表情に修正。上の初回生成を参照し、次を内蔵 image_gen へ送信した。採用ファイルは `shogi-play-v1.webp`。

```text
Use case: precise-object-edit. In this otherwise finished shogi illustration, change ONLY the facial mouths of the TWO small pink Tapi emblems on the wooden pieces (one held by Megu near center-right and one in the lower-right spare-piece tray). They must each have two dot eyes and ONE SHORT STRAIGHT HORIZONTAL LINE for a neutral/deadpan mouth, matching Tapi's established design; not a smile or w-shaped mouth. Retain their tiny hands and pink round earless body. Preserve EVERYTHING ELSE: both main hamster players' faces/poses, all other piece emblems, crown and blue mawashi on the king emblems, the 4x4 grid, colors, shadows, texture, exact 2:1 wide framing, camera, and background. No new objects or text.
```

## 配信形式

先行6枚はすべて1774×887px（2:1）。原寸と構図を保ったままWebP品質90へ変換し、トップのカードでは全体を表示する。全6枚を遅延読み込みする。変換以外の画像編集は内蔵 image_gen で行った。

## 追加4ゲーム（2026-11-08）

たべものしりとり・じんとりがっせん・ミニポーカー・たくめぐすごろくも、同じ内蔵 image_gen で場面絵へ変更。参照1は変更前の各カード、参照2は `baccarat/art/table-friends-v3.png`、参照3は先に採用した `roulette-play-v1.webp`。原寸・初回案・変更前控え・検証画像は `/Users/t.nishimaki/Documents/Codex.nosync/たくめぐ/work/2026-11-08/hub-play-scenes-more/`。

すべて1774×887px。今回の4枚は合計594,316バイト、先行6枚と合わせて10枚。原寸のままWebP品質90へ変換し、トップで遅延読み込みする。ゲーム内素材・各ゲームの設定画面には適用しない。

### 追加分の共通プロンプト

```text
Use case: illustration-story, style-transfer edit. Edit image 1, the current website game-card illustration, into a complete narrative scene of the characters PLAYING that game. Preserve game identity but replace its sparse diagram/icon composition. Image 2 is the authoritative character reference sheet (not a layout). Image 3 is the adopted sibling game-card illustration: MATCH its warm ivory backdrop, clean warm-brown outlines, soft flat pastel shading and friendly rounded picture-book style, but do NOT copy the roulette/table/poses. Deliver ONE landscape illustration, exact 2:1 aspect ratio, no panels, no UI, no frame. Show large recognizable chubby bodies and tiny paws actively participating, not detached face icons. Lavender Taku ALWAYS wears round brown glasses. Cream Megu ALWAYS has four short curved forehead marks. For four-character scenes, add orange Normal Ham with his BLUE sumo mawashi belt and small smooth pink Tapi, who has NO ears, dot eyes, a SHORT STRAIGHT NEUTRAL mouth, two tiny hands and little feet. Exactly the requested characters, no duplicates. All faces visible from front or three-quarter angle. Keep important shapes and all characters within the frame with breathing room. Soft warm ivory background, subtle ground shadow, no busy room. No titles, explanatory captions, rule text, logos, watermarks, speech bubbles or annotation arrows. No photorealism, no glossy 3D, no human fingers, no extra limbs. Do not copy the reference sheet's black background or grid. Make the activity clear even at small card size.
```

### shiritori-play-v1.webp

```text
Scene: TWO characters only: lavender glasses Taku and cream Megu play a FOOD WORD-CHAIN guessing game together on a little picnic mat. Taku enthusiastically holds up a red apple in a tiny paw, with an open talking smile. Megu has a thinking expression, one paw near her cheek, and her other paw presents a small shallow bowl of golden sesame seeds as her answer. This depicts the Japanese food chain apple to sesame, but NO written words. A simple little picnic basket and a couple of fruits at the side, not a feast. The two characters face one another at a slight angle toward the viewer, their full round bodies and feet visible. Focus on their animated back-and-forth conversation rather than eating. Apple and sesame bowl readable but secondary to the characters. A few simple thought/excitement strokes may convey thinking, no enclosing speech bubble. Airy soft honey, peach, ivory, lavender palette.
```

### jintori-play-v1.webp

```text
Scene: All FOUR distinct characters actively RUN and STEP around a small playful park, painting a patchwork of ground squares with their footsteps, a friendly territory-capture game. Lavender glasses Taku runs across a lavender patch, cream Megu dashes over a honey-yellow patch, orange Ham in BLUE mawashi steps across a coral-orange patch, pink earless neutral Tapi trots across a sage-GREEN patch (Tapi's body remains PINK). Tiny dynamic footstep and dash accents. Show large full-body characters from a slightly elevated three-quarter view so faces and ground patches are visible. A small pale blue pond near the center and minimal grass tufts at the edge echo the existing park. Do NOT put them around a tabletop board: they inhabit and run across the colored ground. No tools, brushes, weapons, score counters, time label or numerals. Four active characters balanced in one cohesive joyful scene, with enough space to distinguish each color trail.
```

### poker-play-v1.webp

```text
Scene: All FOUR distinct characters play a friendly THREE-CARD mini poker game around a low green felt table. Lavender Taku with round glasses looks thoughtfully at his fan of exactly THREE cards. Cream Megu smiles delightedly at her THREE cards. Orange Ham with BLUE mawashi considers one card to exchange, two other cards in his paw. Pink earless Tapi holds THREE cards with his unchanged straight-mouth poker face. Their little bodies and paws visible; all four faces visible. A small deck and one exchange card in the middle. Cards have warm ivory faces with distinctive GOLD, SILVER and BRONZE decorative borders matching image 1; show a few simple single numerals from 1 to 9 and tiny hamster emblems, not standard suits. No brand text needed. No chips, coins, money, roulette wheel, drinks or casino imagery: the actual game compares three-card hands without betting. Focus on the amusing contrast of expressions and active paws. Soft sage, ivory and lavender.
```

### sugoroku-play-v1.webp

```text
Scene: All FOUR distinct characters play a seed-collecting SUGOROKU board game together. A low wooden board shows a clear loop of colored squares around a miniature cozy town, with a tiny red-roof house, blue stream and two trees in the center. Lavender Taku with round glasses has just tossed EXACTLY TWO cream dice onto the board, both clearly visible with dark pips and subtle bounce arcs. Cream Megu moves one small cream pawn along the square path. Orange Ham in a BLUE mawashi raises a paw in encouragement. Pink earless neutral Tapi watches calmly and holds one little golden sunflower seed. A few golden seed-shaped tokens beside the board, not coins or currency. Show the characters' large rounded bodies and tiny paws, all faces visible from three-quarter front view around the board. Board lower middle, four friends around it, no text on the squares, no numbered instructions, no lap or timing labels. Friendly shared game moment, warm pastel town, clear dice and path.
```

### ポーカーの最終調整

手札の金9の重複と、角の数字と中央の数字の不一致を調整して採用。

```text
Use case: precise-object-edit. This completed game-card illustration is approved except for THREE small card-number corrections. Change ONLY: (1) On Taku's SILVER middle card showing a large 2, change its tiny top-left 7 to 2 so they match. (2) On Taku's GOLD right card showing 9, change the large 9 to 6, to avoid duplicating the gold 9 held by pink Tapi. (3) On the face-up GOLD 4 card on the table, change the tiny top-left 7 to 4 so they match. Preserve EVERYTHING ELSE exactly: the four characters, their expressions and tiny hands, Taku's round glasses, Megu's forehead marks, Normal Ham's blue mawashi, Tapi's neutral horizontal mouth and no ears, card counts and arrangement, other digits, illustration colors, background, lighting, table, camera and exact wide 2:1 framing. No new objects or text.
```

## すごろくの表情・ポーカーの手と体形の修正（2026-11-08）

採用版を `sugoroku-play-v2.webp`・`poker-play-v2.webp` に更新。旧v1は制作履歴として保持する。内蔵 image_gen の編集を使用し、参照1を各v1、参照2を `baccarat/art/table-friends-v3.png` とした。すごろくは考えるたく・ウインクするめぐ・驚くノーマルハムへ変更し、たぴの無表情は維持。ポーカーはたくの余分な手を除き、たぴを丸い体形へ戻して手札をスタンドに置いた。

原寸・途中案・変更前控え・検証画像は `/Users/t.nishimaki/Documents/Codex.nosync/たくめぐ/work/2026-11-08/hub-scenes-refine/`。2枚とも1774×887px、WebP品質90、合計349,110バイト。トップの2参照だけを更新し、ゲーム用素材は変更しない。

### sugoroku-play-v2.webp の編集指示

```text
Use case: precise-object-edit. Image 1 is the finished sugoroku board-game illustration to revise. Image 2 is a CHARACTER IDENTITY reference only. Change the expressions and related paw gestures of the three HAMSTERS so this is a distinctive thoughtful/funny dice-choice moment, NOT everyone making the same open-mouthed happy face. Lavender glasses Taku: slightly tilted head, eyes looking down at the TWO dice, eyebrows subtly furrowed in concentration, small CLOSED mouth; ONE tiny paw against his cheek, the OTHER rests on the board edge. Exactly two paws. Put both existing dice resting visibly on the board near Taku, retain their faces/pips, remove the old throw arcs. Cream Megu: a pleased playful WINK (one eye closed, other open), a small CLOSED smile, gently moving the same cream pawn with one paw, the other resting at board edge. Orange Normal Ham: eyes open round with mild surprise, a tiny 'o' mouth, both little paws at his cheeks as if reacting to the dice; keep his BLUE mawashi and compact body. Pink Tapi: preserve his straight neutral mouth, dot eyes, earless pink body and seed; he stays deadpan, NOT smiling. Each of all four characters has EXACTLY TWO little paws, no fingers, no extra appendages. Preserve the overall composition, full characters, original chubby character identities, Taku's round glasses, Megu's four forehead strokes, the town board, loop of colored squares, four pawns, seed tokens, warm pastel palette, clean warm-brown lines, ivory background, and exact 2:1 landscape framing. The board and two dice remain clear. No text, no captions, no new characters or objects. Edit only these expressions/poses and necessary dice position; do not redesign the entire scene.
```

### poker-play-v2.webp の編集指示

```text
Use case: precise-object-edit / identity-preserve. Image 1 is the finished mini poker illustration to repair. Image 2 is the AUTHORITATIVE character model sheet, particularly the first-row pink Tapi. The TWO requested repairs are Taku's extra hand and Tapi's distorted body. (1) Lavender glasses Taku, upper left: remove the stray raised paw beside his cheek/chest. He must have EXACTLY TWO short arms and TWO small paws TOTAL, holding the bottom left and bottom right of his single THREE-card fan naturally at lower chest height. No third paw, no vestigial hand-shaped curve, no duplicate limb. Keep his thoughtful facial expression, round glasses, lavender body and the same bronze 7, silver 2, gold 6 cards. (2) Pink Tapi on right: redraw his body to match the reference's small compact nearly CIRCULAR blob silhouette, approximately as wide as tall, NOT a tall pear, not a humanoid torso, no neck, NO ears. Keep dot eyes and ONE SHORT STRAIGHT neutral mouth. Two tiny curled hands sit naturally low at the sides of the round body, and exactly two tiny feet underneath. To avoid stretching Tapi's body or arms to hold cards, put his three existing bronze 2, silver 4 and gold 9 cards upright in a small plain wooden CARD HOLDER resting on the table edge directly in front of him. Tapi is NOT holding the cards. Make the holder small and keep his round silhouette and little paws visible, balanced at the same scene scale as the reference character relative to the hamsters. Keep exactly four characters. Preserve Megu and orange Ham unchanged, their hands/cards, the table, deck, gold 4 table card, numeral values, all card motifs, warm ivory background, line style, pastel coloring, overall framing and exact 2:1 aspect ratio. No text added. No extra hands/arms/feet. This is an anatomical correction, not a new scene.
```

### ポーカーの追補

手・体形の修正時に欠けたノーマルハムの銅6を戻し、各3枚の手札を維持。修正案を参照1、v1を参照2として送信。

```text
Use case: precise-object-edit. Image 1 is the corrected poker illustration and is the edit target. Image 2 is the earlier version, supplied ONLY to restore the orange hamster's missing card. Make TWO tiny repairs in image 1: (1) Restore the single bronze-bordered 6 card held upright in the orange hamster's currently EMPTY raised paw on the viewer's left, exactly as shown in image 2. Orange Ham must have THREE cards total: silver 7 and gold 3 in his lower paw, bronze 6 in the raised paw. Keep exactly two paws. (2) The face-up GOLD 4 card lying on the table currently has a tiny mismatched 7 at its top left; change that tiny corner numeral to 4. Preserve EVERYTHING ELSE from IMAGE 1 exactly, especially Taku's corrected TWO paws holding his three cards, Tapi's corrected compact circular body, neutral face, two tiny curled hands, feet and three-card holder, Megu, other card numbers, table, background, exact colors and 2:1 framing. Do NOT restore any extra hand or the tall distorted Tapi from image 2. No new objects beyond the one restored bronze 6 card.
```

## 背景・配色の差別化（2026-11-08）

背景の似ていたボードゲーム7本とビリヤードの8枚を、内蔵 image_gen で編集。キャラクターの固有色・遊ぶ場面・直前に修正したポーカーの手とたぴの体形、すごろくの表情を引き継ぎ、背景と床の色・控えめな模様を変えた。ほか6ゲームの紹介絵は変更しない。採用版は上の一覧を参照。

各画像を1枚ずつ参照し、次の共通指示＋ゲーム別の Background palette を送信した。参照した版はポーカー・すごろくがv2、ほか6枚がv1。旧版は保持する。生成原寸・候補・変更前控え・検証画像は `/Users/t.nishimaki/Documents/Codex.nosync/たくめぐ/work/2026-11-08/hub-color-variation/`。

採用8枚はすべて1774×887px（2:1）、原寸のままWebP品質90に変換。合計1,152,664バイト。トップの8つの画像参照だけを更新し、CSSやゲーム用素材は変更していない。

### 背景編集の共通指示

```text
Use case: precise-object-edit, BACKGROUND COLOR VARIATION ONLY. Image 1 is an approved completed game-card illustration. The user says the cream/peach backgrounds of all the game cards look too similar, and wants modest differentiation rather than a redesign. Replace ONLY the empty backdrop and floor behind/under the existing figures and game with the palette/motif below. Preserve the foreground faithfully: exact same character identities, poses, expressions, body proportions, hand count and placement, small feet, all game objects, board layout, numbers/pips/emblems, table, wood and felt colors, camera and framing. Do not repaint, recolor or relight the characters with the new background hue. Lavender Taku stays lavender with brown round glasses, cream Megu stays cream with forehead strokes, orange Ham retains BLUE mawashi, pink Tapi stays pink, earless and deadpan. Foreground outline must stay clean and visible against the new background. Keep the original cute hand-drawn pastel illustration style. Background should be visually distinct even as a tiny thumbnail: clear intentional hue, not another almost-ivory wash. Sparse low-contrast pattern only, no room clutter, no new foreground props, no text, no border, no watermark. Natural simple ground shadows can be retinted to match the new FLOOR only. Keep the exact landscape 2:1 aspect ratio and all existing content inside frame.
```

### othello-play-v2.webp

```text
Background palette for this card: Fresh leafy SAGE-GREEN garden palette: a softly textured mint/sage backdrop around #c1dcb2, slightly deeper cool green at the upper corners and a pale fresh green floor. Add only two or three large VERY faint leaf silhouettes at the far background edges, not near faces. A calm garden-air feeling. Preserve the existing green Othello board and every purple/cream playing piece without changing their colors. No blue sky, no new flowers, no furniture.
```

### shogi-play-v2.webp

```text
Background palette for this card: Warm AMBER / TATAMI palette: a muted golden ochre wall around #e4c18e and a light straw-honey floor. Subtle horizontal tatami texture and two restrained darker tan seam lines near the far floor edges, giving the suggestion of a cozy Japanese room without adding furniture. Preserve the wooden board's original honey color and every piece/emblem. This background should read distinctly golden and warm, not peach or pink. Preserve both characters and all existing gestures exactly.
```

### poker-play-v3.webp

```text
Background palette for this card: Quiet DUSK-BLUE palette: a medium desaturated denim/indigo background around #7e91bc, with a slightly lighter blue-gray floor around #b7c3d9. A VERY faint sparse pattern of small diamonds in the background only, softly drawn, no standard card-suit symbols, no text, no casino signs. Distinguish this thumbnail as the blue card-game scene. Preserve the newly corrected Taku with exactly TWO paws holding his three-card fan, and the small CIRCULAR pink Tapi with short curled hands and his THREE cards in a wooden holder. Preserve every character's three cards and all existing card numerals. Keep the table green and characters' natural bright colors; no blue cast on their bodies.
```

### roulette-play-v2.webp

```text
Background palette for this card: Warm DUSTY ROSE / BERRY palette: a muted pink-rose backdrop around #d9a6b7 with a softly lighter rose-clay floor around #ecd0d5. Add a few VERY faint circular glows behind the characters, giving a playful festive feeling without strings, bulbs, stage curtains or casino props. Distinguish the warm rosy roulette scene from the blue poker scene. Preserve exactly the existing wheel, ball, chips and the four friends, all expressions and hand positions.
```

### sugoroku-play-v3.webp

```text
Background palette for this card: Airy SKY-BLUE and meadow palette: soft clear pastel blue sky around #b7dfee above a low soft silhouette of pale green hills and a light grassy green floor around #d5e3b5. Two tiny faint cream clouds at the far upper edge only. The foreground group is still playing the exact same tabletop board game; only the blank background becomes a simple outdoor color setting. Preserve the recently updated expressions EXACTLY: thoughtful glasses Taku, winking cream Megu, surprised orange Ham, neutral pink Tapi. Preserve exactly TWO dice, all pawns, seed tokens and the town board. Do not change their poses or replace the board with an outdoor life-size town.
```

### mahjong-play-v2.webp

```text
Background palette for this card: Fresh JADE / TURQUOISE palette: a softly textured jade backdrop around #8fcabd and a light aqua floor around #c1e1d7, noticeably cooler and more turquoise than leafy sage green. Add only a VERY subtle large-scale geometric lattice pattern near upper backdrop edges, quiet tea-room mood, no new props, no writing. Keep the original ivory tiles, their tiny motifs and numerals, green tabletop, both characters and their expressions completely unchanged. Maintain strong readability of each tile.
```

### blocks-play-v2.webp

```text
Background palette for this card: Playful PERIWINKLE / LILAC-BLUE palette: a pastel periwinkle background around #c6c4e5 and a pale lavender-blue floor around #e0def0. Add a sparse very faint large square grid and three abstract rounded L/T/square silhouettes behind the scene at outer edges, like a gentle puzzle-themed wallpaper. Keep all existing actual foreground blocks, colors, board cells, arrows, hamster poses and gestures unchanged. Background patterns must stay much lighter and lower contrast than the real blocks. No text or new game pieces.
```

### billiards-play-v2.webp

```text
Background palette for this card: Cozy CHALK-TEAL palette: a medium muted smoky blue-green backdrop around #88aaa6 and a lighter cool stone/sage-gray floor around #c9d6ce. A broad soft cream oval glow high in the background may suggest pool-room light, but do not add a physical lamp, frame, wall sign, furniture or extra props. Give this card a deeper, cooler backdrop than the other light pastel cards. Preserve the ROUND green billiards table, six pockets, cues, balls, little gold line-art logo, characters, their natural colors and hand positions exactly.
```

### しょうぎのたぴの表情を補正

背景編集時に変化した小さなたぴの駒絵を、再度無表情へ整えた。背景調整後の絵を参照1、元のv1を参照2として使用。

```text
Use case: precise-object-edit. Image 1 is the new shogi illustration with the approved golden tatami background. Image 2 is the earlier version, supplied ONLY as the reference for the TWO tiny pink Tapi faces on the wooden pieces. Restore their mouths from image 2: the pink Tapi emblem on the piece Megu is holding, and the pink Tapi emblem in the spare-piece tray at lower right, must each have ONE SHORT STRAIGHT HORIZONTAL LINE for their mouth, with two dot eyes. No smile, no w-shaped curve. Change ONLY these two mouth strokes, preserving every other pixel/shape as closely as possible. Keep image 1's new golden wall, tatami floor, characters, gestures, board, piece positions, all other piece emblems, colors, sizes, tiny hands, shadows and exact 2:1 framing. Do not restore image 2's pale background.
```

## おさんぽ・ぽよんバトルの構図を変更（2026-11-08）

内蔵 image_gen の編集モードで2枚を制作。おさんぽは木漏れ日の小道で2匹が進む場面、バトルは夕焼けの足場で4匹が跳ね返る場面に分けた。画像内の％表示は削除。キャラ原画・ゲーム素材は変更していない。

採用ファイルは `sanpo-play-v1.webp`（237,052バイト）と `battle-play-v1.webp`（156,136バイト）。どちらも1774×887px（2:1）、原寸のままWebP品質90で保存。透過指定は false。先頭2カードなので即時読み込みし、おさんぽだけ高優先度。既存10枚の遅延読み込みは維持する。トップのみで使用し、おさんぽゲームの再出力は不要。

参照1は変更前の各カードをブラウザーで記録した `before-sanpo.png` / `before-battle.png`、参照2は `baccarat/art/table-friends-v3.png`、参照3は画風だけを参照する `assets/hub/jintori-play-v1.webp`。原寸PNG・初回案・参照控え・検証結果は `/Users/t.nishimaki/Documents/Codex.nosync/たくめぐ/work/2026-11-08/hub-action-scenes/`。初回は下記の共通指示＋ゲーム別指示を送信。バトルの小さなたぴに手が見えなかったため、初回のバトル画像とキャラ原画を参照して最後の補正を実施した。

### 共通指示

```text
Use case: illustration-story. Edit image 1, the current website game-card picture, into a fresh narrative illustration with a NEW composition. Preserve the game identity, not the old sprite/UI layout. Image 2 is the authoritative CHARACTER reference sheet. Image 3 is a STYLE reference only: match its warm-brown clean outlines, rounded head-and-body silhouettes, tiny paws and feet, soft pastel paint texture and friendly picture-book charm; do NOT copy its four-quadrant layout, pond or colored ground. Deliver ONE finished landscape illustration, EXACT 2:1 aspect ratio, no frame, no UI. Each character has exactly TWO small forepaws and TWO feet, no human fingers, no extra appendages. Taku is lavender with round brown glasses. Megu is cream with four short curved forehead strokes. If included, Normal Ham is orange with BLUE sumo mawashi and Tapi is a smooth small PINK earless round blob with two dot eyes and one short straight neutral mouth. Preserve these identities and natural body colors. Characters are full small bodies participating in the scene, never detached face icons. Keep the faces visible from a front/three-quarter angle. No lettering, game title, explanatory captions, percentages, numbers, HUD, symbols-as-text, logos or watermarks. No realistic rendering or shiny 3D. Keep all important subjects inside the image with breathing room.
```

### sanpo-play-v1.webp

```text
A peaceful SNACK-COLLECTING WALK AND LITTLE JUMP, with ONLY lavender glasses Taku and cream Megu. Composition: an inviting broad woodland path winds gently from the lower-left foreground toward the upper-right distance under leafy trees, with soft warm morning sunlight and dappled shade. The two large full-body friends are travelling together to the right, diagonally into the scene; not facing one another across a board. Taku on the left walks happily carrying a small woven picnic basket in ONE paw, the other paw points toward the next snack. Megu on the right is making ONE light little hop over a shallow stream on a stepping stone, happily reaching toward a small bunch of purple grapes just above the path. A short trail of 3 or 4 clearly illustrated grape snacks leads onwards, suggesting the game's snack collecting. Their expressions are gentle, relaxed and curious. Show the path, a small wooden footbridge further back, a few white daisies and very simple layered leafy shapes; avoid busy tiny details. The characters occupy about 55-60% of the image height so they are readable in a small card, with plenty of scenery around them. Green foliage, pale honey sunlight and cream-earth path palette, intimate green woodland feeling, not a big blue-sky arena. No floating game platforms, fighting, impact bursts or opponents. The story should read as a leisurely adventure to a picnic, with one small jump.
```

### battle-play-v1.webp

```text
A lively playful PLATFORM KNOCKBACK BATTLE with ALL FOUR distinct characters. A bold close action composition: lavender glasses Taku and orange Normal Ham wearing BLUE mawashi have just bumped their round bodies together near the center and are springing APART along opposite DIAGONAL arcs. Taku rebounds toward upper-left with a determined playful grin; orange Ham rebounds toward lower-right with wide surprised eyes and a tiny 'o' mouth. One compact soft golden star-shaped impact puff BETWEEN their bodies, never covering their faces. Cream Megu is smaller behind them at upper-right, happily leaping toward the action with paws spread. Tiny round PINK earless neutral Tapi floats above a small side ledge at the far left, following a curving bounce arc, unchanged straight neutral mouth. Exactly four, no duplicates. A single broad low floating ARENA LEDGE across the bottom and one little side ledge make the off-stage platform-battle theme clear; no tables or board games. All feet/limbs and full main bodies remain visible; the main two are large, about 65% image height. Use elastic squash-and-stretch poses and a few broad curved speed lines to tell the knockback story, not stiff upright portraits. Warm CORAL sunset with dusky VIOLET cloud shapes behind the arena, visually very different from a leafy walking scene. Keep background simple and pastel, not an outdoor grassy meadow, no picnic or winding path. Friendly comic rebound, no weapons, punching, injury or angry violence. Remove all percentage counters and game UI from the old card.
```

### バトルのたぴの手を補正

```text
Use case: precise-object-edit. Image 1 is the completed coral-sunset platform battle illustration. Image 2 is the character model reference. Change ONLY tiny pink Tapi in the UPPER-LEFT corner: add his TWO SMALL CURLED FOREPAWS on the lower-front part of his round body, matching the tiny C-shaped hands of the pink Tapi reference. One on his lower-left front and one on his lower-right front, just above the existing two feet. He currently has no visible hands; keep them short and proportionate, not arms reaching out. Keep his smooth circular pink earless body, both existing feet, dot eyes, and SHORT STRAIGHT neutral mouth exactly. Preserve EVERYTHING ELSE from image 1: the other three characters, Taku's round glasses and dynamic pose, Normal Ham's blue mawashi and surprised face, Megu's jump, star impact, motion arcs, platforms, coral/violet sunset, framing, texture, original 2:1 aspect ratio. No additional limbs, no new objects, no text.
```

## バトルの穏やかな接触・ぎょうざ／クイズの一枚絵化（2026-11-08）

内蔵 image_gen の編集モード。バトルは自然な表情の2匹がお腹を軽く当てる場面へ調整。ぎょうざ・クイズは既存配置を生かし、SVGの図形も含めて手描きの一枚絵へ変更。トップ紹介のみで使用し、ゲーム本体・設定画面・共有原画は変更しない。全14枚がWebPとなったため、トップの旧 `hub-art.js` 読込を削除（ファイルは保持）。先頭のおさんぽ・バトルは即時、ほか12枚は遅延読み込み。

採用3枚はすべて1774×887px・2:1。原寸のままWebP品質90に変換、透過指定は false。旧版は保持。

- `battle-play-v2.webp`：119,060バイト。
- `gyoza-play-v1.webp`：223,154バイト。
- `quiz-play-v1.webp`：133,644バイト。

原寸PNG・初回案・変更前控え・検証結果：`/Users/t.nishimaki/Documents/Codex.nosync/たくめぐ/work/2026-11-08/hub-gentle-complete/`。参照画像と実際に送信した各プロンプトは以下。

### battle

参照1：`/Users/t.nishimaki/Documents/ChatGPT/たくめぐ/pages-preview/assets/hub/battle-play-v1.webp`。

参照2：`/Users/t.nishimaki/Documents/ChatGPT/たくめぐ/pages-preview/baccarat/art/table-friends-v3.png`。

```text
Use case: precise-object-edit. Image 1 is the current battle website illustration to revise; image 2 is the authoritative character model sheet. Keep the coral-and-violet sunset, soft painted texture, floating low arena and four recognizable characters. Main request: make this MUCH gentler and more relaxed. The central lavender glasses Taku and orange blue-mawashi hamster are doing a tiny playful JUMPING BELLY BUMP. Show their rounded bellies lightly touching at center as both hover just above the platform, bodies upright with only a small inward tilt, faces visible at a front three-quarter angle. Their little feet hang downward UNDER their own bodies, both feet visible and away from the other character; absolutely no leg or foot thrust toward the opponent, no kicks, punching or combat poses. Paws loosely bent beside their own chest, no clenched fists. Remove the sharp central impact star and intense speed rays: just two very small soft curved bounce marks around the touching bellies, light and airy. Taku and orange hamster have relaxed dot-like eyes, gentle natural small closed-mouth smiles, no angry slanted brows, no grimace, no shocked wide eyes or open O mouth. Cream Megu softly hops behind them with a gentle small smile instead of a shout. Pink earless Tapi stays small and perfectly neutral with dot eyes, short horizontal mouth, two small C-shaped forepaws and two feet. Preserve purple Taku with round brown glasses, cream Megu with four forehead strokes, orange hamster with BLUE sumo mawashi, pink round Tapi. Maintain four characters only and all limbs naturally proportioned. It should feel like fluffy friends bouncing together, not a fight. Same 2:1 frame, warm brown outlines and gentle pastel storybook rendering, no text, numbers or UI.
```

### gyoza

参照1：`/Users/t.nishimaki/Documents/Codex.nosync/たくめぐ/work/2026-11-08/hub-gentle-complete/before-gyoza.png`。

参照2：`/Users/t.nishimaki/Documents/ChatGPT/たくめぐ/pages-preview/baccarat/art/table-friends-v3.png`。

```text
Use case: illustration-story. Asset type: a finished website game-card illustration, wide landscape EXACT 2:1 aspect ratio. Fully hand-drawn cohesive picture-book illustration, all scenery and props rendered in the same style, NOT a diagram, SVG mockup, collage or geometric UI assembled around character cutouts. Warm brown outlines, soft pastel paint texture, plump rounded little bodies, tiny paws and feet. Keep the established character identities: Taku is lavender with round brown glasses; Megu is cream with four curved forehead strokes. Exactly two small forepaws and two feet per character, no extra limbs, no human fingers. Large readable characters and a simple clear scene at mobile-card size, leave breathing room around the subjects. No captions, numbers, titles, letters, arrows, percentages, logos or watermarks. No photorealism, glossy 3D or dark harsh outlines. Input images: image 1 is the CURRENT COMPOSITION to preserve in spirit, image 2 is the character model reference only. Scene: Taku on the left and Megu on the right play at stacking crescent-shaped pan-fried GYOZA on a large pale celadon oval plate in the center foreground. Three real-looking but cute hand-painted dumplings are piled into a slightly wobbly little tower, with folded pleated wrapper edges and warm golden toasted underside patches. Taku is carefully lowering ONE fourth dumpling just above the tower with one tiny paw; his other paw rests beside his chest, natural balance. Megu watches eagerly with a gentle delighted smile and both little paws loosely together near her chest. Preserve the friendly character sizes and left/right arrangement of the current image. Draw the entire plate, dumplings, soft linen/check tablecloth and cozy cream/sage backdrop as one coherent illustration with natural small irregularities, subtle soft shadows, not flat computer ellipses or perfect geometric paths. Warm pale kitchen/tabletop mood; no need for a detailed room. Do not make dumplings triangular or a pyramid of identical shapes. No dotted guide, falling arrow or diagram labels. Two full small bodies, not floating face icons; table can naturally hide their feet.
```

### quiz

参照1：`/Users/t.nishimaki/Documents/Codex.nosync/たくめぐ/work/2026-11-08/hub-gentle-complete/before-quiz.png`。

参照2：`/Users/t.nishimaki/Documents/ChatGPT/たくめぐ/pages-preview/quiz/art/show-cast-v1.png`。

参照3：`/Users/t.nishimaki/Documents/ChatGPT/たくめぐ/pages-preview/baccarat/art/table-friends-v3.png`。

```text
Use case: illustration-story. Asset type: a finished website game-card illustration, wide landscape EXACT 2:1 aspect ratio. Fully hand-drawn cohesive picture-book illustration, all scenery and props rendered in the same style, NOT a diagram, SVG mockup, collage or geometric UI assembled around character cutouts. Warm brown outlines, soft pastel paint texture, plump rounded little bodies, tiny paws and feet. Keep the established character identities: Taku is lavender with round brown glasses; Megu is cream with four curved forehead strokes. Exactly two small forepaws and two feet per character, no extra limbs, no human fingers. Large readable characters and a simple clear scene at mobile-card size, leave breathing room around the subjects. No captions, numbers, titles, letters, arrows, percentages, logos or watermarks. No photorealism, glossy 3D or dark harsh outlines. Input images: image 1 is the existing quiz-card COMPOSITION; image 2 is the quiz cast and expressions; image 3 is basic anatomy. Preserve the idea of this calm little QUIZ SHOW: lavender glasses Taku sits on a comfortable round stool at the left as the thoughtful contestant, a small paw near his chin; cream Megu sits at the right as the friendly host, holding a small plum cue-card bearing a simple golden sunflower illustration in one paw and welcoming Taku with the other paw. Exactly these TWO characters. Draw both stools with rounded plush seats and coherent legs, one small round table between them, and the whole deep muted PLUM/PURPLE stage as unified storybook artwork. Soft hand-painted spotlights from above, warm golden rim accents, gentle light on the characters and a small decorative sunflower medallion at the top center suggest a quiz studio. Keep faces large and natural, the host welcoming, the contestant curious rather than worried. The stage floor is softly curved with painted shadows, not flat SVG ellipses; lighting beams should be diffuse and painterly instead of hard geometric triangles. Preserve the existing left/right arrangement and open space between them. All stage objects illustrated with warm brown/plum lines and soft paint texture, no pasted-in diagram shapes. Remove the existing MEGUHAMUA lettering and A/B/C/D text; no replacement title or text. The cue-card and host/contestant setting communicate the quiz. Both characters retain exactly two paws and small feet, no formal clothing, no microphone needed.
```

### クイズのたくの手を補正

参照は上の初回クイズ画像（`generated/quiz_initial.png`）。

```text
Use case: precise-object-edit. In this finished quiz-show illustration, change ONLY lavender glasses Taku at the left: he currently has only one visible curved forepaw at his chest. Add his second tiny rounded lavender forepaw at the lower LEFT FRONT of his own body (viewer-left), gently resting down near the edge of his seat, with one short warm-brown curved outline matching the existing character drawing. Keep the existing chest paw, two feet, round body size, glasses, face, eyes and mouth unchanged. Two small forepaws total, no long arm, no fingers, no extra feet. Do not alter Megu, her cue card, any furniture, sunflowers, lighting, composition, color, soft painterly texture or the 2:1 framing. No text.
```

## バトルのめぐ・クイズ中央ロゴを修正（2026-11-08）

内蔵 image_gen の部分編集。バトル右上のめぐだけを原画に合わせた丸い体と自然な顔へ描き直し、ほか3匹と場面を維持する指示。クイズはユーザー指定により、中央の小さな花飾りをミリオネア風の紫と金の円形装飾と「MEGUHAMUA」ロゴへ変更。文字はHTMLの重ね合わせではなく画像内に描く。2匹と家具を維持する指示。

採用は `battle-play-v3.webp`（111,636バイト）・`quiz-play-v2.webp`（162,970バイト）。どちらも1774×887px、原寸のままWebP品質90へ変換。透過指定は false。旧版を保持し、トップの2参照のみを変更。生成原寸・変更前控え・検証画像・差分は `/Users/t.nishimaki/Documents/Codex.nosync/たくめぐ/work/2026-11-08/hub-megu-logo/`。

### battle

参照1：`/Users/t.nishimaki/Documents/ChatGPT/たくめぐ/pages-preview/assets/hub/battle-play-v2.webp`。

参照2：`/Users/t.nishimaki/Documents/ChatGPT/たくめぐ/pages-preview/baccarat/art/table-friends-v3.png`。

```text
Use case: precise-object-edit. Edit ONLY the small CREAM MEGU character in the UPPER-RIGHT of image 1. Image 2 is the authoritative character sheet: Megu is the cream hamster in column 2. Redraw this upper-right character with Megu's proper compact nearly circular head-and-body silhouette, two small rounded ears, four simple curved forehead strokes, two round brown open eyes with tiny white highlights, pink cheeks, and a natural tiny relaxed smiling mouth. Give her exactly two short rounded forepaws slightly lifted out to either side and two small feet below, in a soft floating little jump. She must look like the same Megu from the reference, not a long pear-shaped body, no squinting sideways eyes, no distorted face, no long limbs. Keep her in the same upper-right location and about the same size, leaving the image edge clear. Match the existing warm brown outlines and soft pastel rendering. STRICTLY preserve ALL other parts of image 1: lavender Taku, orange blue-mawashi hamster and their gentle belly-bump poses, neutral pink Tapi with two C-shaped hands, all other expressions, sunset, clouds, platforms, colors, framing and motion arcs. No changes to those three characters. Original wide 2:1 aspect ratio. No text, logo, new objects or extra characters.
```

### quiz

参照1：`/Users/t.nishimaki/Documents/ChatGPT/たくめぐ/pages-preview/assets/hub/quiz-play-v1.webp`。

```text
Use case: precise-object-edit. Add one prominent illustrated quiz-show LOGO in the central empty backdrop of this existing illustration. Replace the small sunflower and flourish at the top center with a larger circular badge centered horizontally between the two characters and above the central table, occupying that open space without covering either face, paw or body. The requested logo is inspired by the recognizable grand circular, symmetrical interlaced/radial design of Who Wants to Be a Millionaire / Quiz Millionaire, but custom-made for this hamster quiz: concentric purple and gold rings, elegant curling radial ribbons and small sunflower-seed/petal motifs, a dark plum inner field, subtle warm golden glow. Across the CENTER of the badge put the exact single word "MEGUHAMUA" in LARGE bold warm ivory/gold uppercase letters on a dark horizontal name band. Spelling: M E G U H A M U A, nine letters, one line, clearly legible even when the image is a small website card. No other words, no subtitles, no numbers, no currency signs. It must read as a polished game-show crest and title, while retaining the illustration's softly painted texture; avoid excessively fine details. STRICTLY preserve both characters including Taku's two paws, glasses, eyes, mouth, and Megu's pose and sunflower cue card, as well as both stools, table, stage floor, lighting, plum/gold palette and original 2:1 framing. Alter only the central backdrop/emblem region to integrate the logo naturally. Do not move or shrink characters.
```

## クイズの手とロゴサイズを修正（2026-11-08）

内蔵 image_gen の部分編集。たくの左下で足に重なっていた手の曲線をなくし、手を胸元と側面に分けて描き直す。中央の円形ロゴを小さくし、2匹との間に余白を確保。ロゴの綴りは「MEGUHAMUA」。参照は `quiz-play-v2.webp`。採用は `quiz-play-v3.webp`、1774×887px、133,970バイト、原寸WebP品質90、透過指定 false。旧版は保持。

原寸・変更前控え・ブラウザー検証・差分：`/Users/t.nishimaki/Documents/Codex.nosync/たくめぐ/work/2026-11-08/hub-quiz-hands/`。実際に送信した編集指示（75%は目標指定）：

```text
Use case: precise-object-edit. Revise ONLY two things in this finished quiz illustration: Taku's paw arrangement, and the logo size. 1. The lavender hamster at LEFT currently has an extra-looking U-shaped paw low on the viewer-left belly overlapping a foot. REMOVE that lower-left U-shaped appendage and its curved interior line completely; restore a clean uninterrupted lavender belly there. Make his TWO FOREPAWS unambiguous and naturally separated from his feet: keep ONE small curved thinking paw just below his chin at the center-right of his chest, and put his OTHER small rounded forepaw attached to the viewer-left SIDE of his torso at chest height, gently bent toward the body. This second paw should be a short connected side arm, not another floating C/U on the lower belly. Exactly TWO forepaws total, no additional hands, fingers or stray curved limb marks on the belly. Retain his TWO small feet at the very bottom of his body on the cushion, clearly separate from the two chest-height hands. Keep Taku's round body proportions, glasses, eyes, ears, smile and lavender color. 2. Reduce the entire central circular MEGUHAMUA logo, including its name band, to approximately 75% of its current width and height. Keep its current center position, centered between the characters above the table; naturally fill the newly revealed surrounding space with the existing plum stage backdrop. Keep the purple/gold interlaced ring design and EXACT legible uppercase text "MEGUHAMUA" unchanged, nine letters M E G U H A M U A. Preserve EVERYTHING ELSE: cream Megu and her two hands/cue card, stools, table, stage lighting, floor, painterly texture, warm colors, original 2:1 aspect ratio and framing. No new objects, no extra text. This is a precise local correction, not a new composition.
```

## 指定された頬の左下の手を削除（2026-11-08）

ユーザーが位置を明示した、たくの頬の左下の手のみを内蔵 image_gen で削除。胸元の手・下の足・小さいロゴなどは継承し、手を別の場所へ描き足さない。参照は `quiz-play-v3.webp`。採用は `quiz-play-v4.webp`、1774×887px、127,048バイト、原寸WebP品質90、透過指定 false。旧版は保持。

原寸・変更前控え・検証・差分：`/Users/t.nishimaki/Documents/Codex.nosync/たくめぐ/work/2026-11-08/hub-quiz-remove-side-hand/`。編集指示：

```text
Use case: precise-object-edit. Make ONE tiny local deletion in this image. On lavender Taku at the LEFT, DELETE the sideways C-shaped hand directly BELOW AND TO THE LEFT of his pink viewer-left cheek. On this 1774 x 887 image it is the curved brown paw outline approximately x=255..330, y=450..525. Erase that hand's brown curved line and any paw highlight, replacing that small patch with smooth lavender body paint matching its immediate surroundings. Keep the original round OUTER body silhouette. DO NOT redraw or move this hand elsewhere, DO NOT add any replacement hand or any new limb. Keep the existing curved hand at the CENTER of his chest (below the mouth) exactly unchanged. Keep BOTH little feet at the bottom exactly unchanged. Also keep Taku's face, glasses, ears, cheeks, smile and body size unchanged. Preserve ALL other pixels/composition as closely as possible: cream Megu, her cue card, both stools, central table, stage and lighting, and the SMALL circular MEGUHAMUA logo at its CURRENT SIZE and position with its exact lettering. No other corrections or additions. Same wide 2:1 image. Only remove the specified viewer-left cheek-side hand.
```
