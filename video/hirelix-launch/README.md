# Hirelix launch film (35 s)

Standalone Remotion project. It does not touch the web app; the root `tsconfig.json` and ESLint config exclude `video/`.

Sample candidates and companies in `src/data.ts` are illustrative, not real people.

## Rebuild

```bash
npm install
npm run audio    # original score + SFX -> public/audio/score.wav
npm run render   # out/hirelix-launch-master.mp4 (1920x1080, 30 fps, H.264 + AAC)
npm run still    # out/hirelix-launch-cover.png (frame 1020)
npm run studio   # edit with live preview
```

Web encodes for the landing-page player. The master is tagged with an sRGB transfer (`iec61966-2-1`), which Chrome will not play from these files; tag the encodes BT.709 (pixels are unchanged):

```bash
ffmpeg -i out/hirelix-launch-master.mp4 -c:v libx264 -crf 26 -preset slow -pix_fmt yuv420p -color_primaries bt709 -color_trc bt709 -colorspace bt709 -movflags +faststart -c:a aac -b:a 128k out/hirelix-launch-web.mp4
ffmpeg -i out/hirelix-launch-master.mp4 -c:v libvpx-vp9 -crf 36 -b:v 0 -row-mt 1 -color_primaries bt709 -color_trc bt709 -colorspace bt709 -c:a libopus -b:a 96k out/hirelix-launch-web.webm
```

## Structure

- `src/timeline.ts` master frame timeline; every animation is a pure function of the frame.
- `src/scenes/` hook, agent research, shortlist, client memory, board, brand lockup.
- `src/ui.tsx`, `src/lib.ts` shared UI kit and easing.
- `audio/build-score.mjs` synthesises the music and sound design in Node (no samples).
