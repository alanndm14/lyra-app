# Lyra — Lyrics feel alive

Lyra convierte la búsqueda de una canción en una experiencia visual: la portada define el color de la escena y la letra cobra vida línea por línea y palabra por palabra.

## Experiencia

- Búsqueda por canción, artista o álbum con portadas y metadatos de Apple.
- Letras completas o sincronizadas mediante LRCLIB.
- Modos Cine, Flujo y Texto para cambiar la forma de leer.
- Paleta extraída de la portada, fondo ambiental y animación cinética por palabra.
- Fragmentos de audio de 30 segundos con alineación manual: reproduce el fragmento y toca la línea que estás escuchando.
- Favoritos, historial, control tipográfico y preferencia de movimiento guardados en el dispositivo.
- Diseño adaptable, navegación por teclado y shell instalable con soporte sin conexión.

## Ejecutar localmente

```bash
npm start
```

Abre `http://localhost:4173`.

## Publicación

La aplicación es estática y está preparada para GitHub Pages. En producción consulta directamente los proveedores; al ejecutarse localmente usa el pequeño servidor incluido como intermediario.

## Alcance de audio y letras

Lyra no distribuye canciones completas. Los fragmentos dependen de la disponibilidad regional de Apple y las letras dependen del catálogo de LRCLIB. El enlace externo permite abrir la canción en Apple Music. Para comercializar el producto se deben revisar y formalizar licencias, términos de los proveedores, analítica, autenticación y una política de privacidad.
