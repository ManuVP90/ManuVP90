# Dirección de arte y recursos gráficos

## Concepto visual

Mapa de papel envejecido y tinta sobre mar profundo: pergamino para paneles y cartas, azul de mar para el fondo,
dorado para lo que se puede pulsar o está activo. Inspirado en los carteles de recompensa y en los mapas de
navegación, no en la paleta de la serie.

## Paleta (tokens propuestos)

| Token | Hex | Uso |
|---|---|---|
| `--parchment` | #f4ecd8 | Fondo de paneles y cartas |
| `--ink` | #2b2118 | Texto y bordes |
| `--sea` | #1d4e6b | Fondo principal |
| `--sea-deep` | #0f2a3a | Fondo del tablero |
| `--gold` | #d4a02a | Estados activos, botones principales |
| `--crimson` | #b3262e | Vida, daño, alertas |

Colores de facción (para el borde de la carta y el icono de sinergia; se eligen para distinguirse también en blanco y negro):

| Facción | Hex |
|---|---|
| Sombrero de Paja | #e0523b |
| Marina | #1f3a68 |
| Yonkō | #6a3d9a |
| Revolucionarios | #8c3b2e |
| Hombres Pez | #1f8a8a |
| Shichibukai | #3a3a3a con filo dorado |

## Tipografía

- **Títulos:** Cinzel (SIL Open Font License 1.1, verificado en su OFL.txt de Google Fonts). Es serif clásica y queda bien con el pergamino.
- **Texto de interfaz:** Open Sans o similar de Google Fonts (OFL). Legible en números pequeños.
- **Descartadas por ahora:** Uncial Antiqua (OFL, pero el nombre es marca registrada de Astigmatic; hay que
  tener cuidado si se renombra) y tipografías "pirata" de pago o de uso personal, que no sirven para un proyecto publicable.
- **Pendientes de verificar:** MedievalSharp y Pirata One aparecen en agregadores como OFL, pero no encontré su OFL.txt oficial.

## Iconos y elementos de interfaz

- **Kenney Board Game Icons** (CC0): iconos de cartas, dados, recursos y acciones. Válido para oro, vida, nivel y botones.
- **Kenney UI Pack** (CC0): botones, paneles y barras. Se puede recolorear con los tokens de arriba.
- Kenney pide crédito en sus packs, pero es opcional. Recomiendo darlo igualmente en los créditos.

## Ilustración, fondos y decoración

- **Kenney Pirate Pack** (CC0): barcos y casetas en vista cenital, útil para el fondo del tablero o la pantalla de lobby.
  No contiene personajes jugables; confirmar antes de usar.
- **Sailors & Pirates** de OpenGameArt: buenos sprites de piratas, pero con licencia CC-BY, que obliga a dar crédito.
  Sirve como referencia de estilo o como placeholder con crédito, no como arte definitivo de los personajes de One Piece.
- Marcos de carta: no encontré un set CC0 con temática náutica. Propongo dibujarlos en SVG con los tokens de color.

## Personajes: el punto delicado

No hay arte CC0 de personajes de One Piece, y no lo debemos buscar en la web. Lo que encontré:

- Oda cedió temporalmente sus derechos en 2015, solo para los sellos de LINE y durante un año. No es una licencia general.
- La wiki de One Piece indica que el fan art no se admite en sus imágenes y que los derechos son de Oda, Shueisha y Toei.
- Shueisha ha emitido reclamaciones DMCA por usos no comerciales de sus obras (avatares, banners).
- No encontré la política oficial de Shueisha ni de Toei sobre juegos de fans. Hay que preguntarles directamente antes de publicar.

Por eso la propuesta es:

1. **Ahora:** placeholders hechos con código, con las iniciales del personaje, el color de su facción y el marco del coste.
2. **Si el juego se publica:** arte original encargado con esta guía, sin copiar poses ni diseños de la serie.
3. **Si se quiere usar arte o nombres oficiales:** pedir permiso a Shueisha y Toei antes de publicar.

## Coherencia

- Todas las piezas gráficas usan los tokens de color de este documento, no colores sueltos.
- Los iconos Kenney se recolorean para encajar con el pergamino y el mar; no se mezclan con iconos de otro estilo.
- Una sola familia de títulos (Cinzel) y una de texto (Open Sans).

## Fuentes

- Kenney, Board Game Icons: https://kenney-assets.itch.io/board-game-icons
- OpenGameArt, Kenney UI Pack: https://opengameart.org/content/ui-pack
- Kenney, Pirate Pack: https://kenney.nl/assets/pirate-pack
- OpenGameArt, Pirate Kit: https://opengameart.org/content/pirate-kit
- OpenGameArt, Pirate Pack (190+): https://opengameart.org/content/pirate-pack-190
- Cinzel, OFL.txt: https://github.com/google/fonts/blob/main/ofl/cinzel/OFL.txt
- Google Fonts, FAQ: https://developers.google.com/fonts/faq
- One Piece Wiki, Copyrights: https://onepiece.fandom.com/wiki/One_Piece_Wiki:Copyrights
- Newsweek, reclamaciones de Shueisha: https://www.newsweek.com/shueisha-copyright-takedown-twitter-accounts-anime-one-piece-dragon-ball-1560097
- Inquirer, waiver de Oda (2015): https://pop.inquirer.net/96123/one-piece-creator-waives-copyright-to-help-fans-sell-artwork-but-here-are-some-rules
