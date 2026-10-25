import { portrait } from "../baccarat/art.js?v=20261024-baccarat4";

let colorId = 0;
function coloredTapi(pose, color) {
  const id = `poker-tapi-${++colorId}`;
  // Mask only bright pink skin. Dark outlines, black eyes, cheeks and white
  // highlights retain their original pixels; the source atlas is unchanged.
  const matrix =
    color === "blue"
      ? "0 1 0 0 0  .5 .5 0 0 0  1 0 0 0 0  0 0 0 1 0"
      : "1 0 0 0 0  .55 0 .45 0 0  0 1 0 0 0  0 0 0 1 0";
  const filter = `<filter id="${id}" color-interpolation-filters="sRGB"><feColorMatrix in="SourceGraphic" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 20 0 0 -11" result="bright"/><feColorMatrix in="SourceGraphic" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  12 -12 0 0 -.3" result="pink"/><feComposite in="bright" in2="pink" operator="in" result="skin"/><feColorMatrix in="SourceGraphic" values="${matrix}" result="colored"/><feComposite in="colored" in2="skin" operator="in" result="newSkin"/><feComposite in="SourceGraphic" in2="skin" operator="out" result="details"/><feComposite in="newSkin" in2="details" operator="over"/></filter>`;
  return portrait("tapi", pose)
    .replace("<defs>", `<defs>${filter}`)
    .replace("<image ", `<image filter="url(#${id})" `);
}

function faceCrop(markup, character) {
  // Crop the displayed view, leaving the original shared character atlas intact.
  return markup.replace(
    /viewBox="([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)"/g,
    (_, x, y, w, h) =>
      `viewBox="${+x + w * 0.075} ${+y + (character === "tapi" ? h * 0.12 : 0)} ${w * 0.85} ${h * 0.76}"`,
  );
}

export function pokerPortrait(character, pose = "neutral", friends = false, face = false) {
  const artPose = { sad: "tell", happy: "tell", worried: "tell", friends: "neutral" }[pose] ?? pose;
  const markup =
    character !== "tapi" || !friends
      ? portrait(character, artPose)
      : `<span class="tapi-group"><span class="tapi-friend tapi-blue">${coloredTapi(artPose, "blue")}</span><span class="tapi-friend tapi-yellow">${coloredTapi(artPose, "yellow")}</span><span class="tapi-leader">${portrait("tapi", artPose)}</span></span>`;
  return face ? faceCrop(markup, character) : markup;
}
