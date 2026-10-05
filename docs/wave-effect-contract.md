# Local Wave effect contract

PixelForge's **Filter → Distort → Wave…** command is a bounded,
nondestructive directional displacement. It stores the validated
`adjustments.filterEffects` record on the selected layer; the immutable raster
asset, layer transform and masks remain unchanged.

`amount` is a 0–100 displacement strength, `radius` is the integer wavelength
control from 1–64 source pixels, and `angle` is the direction of travel in the
inclusive range -180–180 degrees. The wave travels along that direction and
displaces pixels on its perpendicular axis with a sinusoidal phase. The
renderer limits the displacement to 45% of the shorter source dimension (or
half the wavelength), so even a tiny canvas remains bounded. A radius of zero
or amount of zero is an exact identity copy.

Each output pixel inverse-maps into the immutable source with deterministic
premultiplied-alpha bilinear interpolation. RGB hidden behind fully
transparent pixels therefore cannot bleed into visible edges. Destination
alpha bytes and transparent RGB padding remain unchanged, and the same
metadata always produces the same result without remote processing or source
upload.

The pure filter suite covers bounded metadata, deterministic repeatability,
source immutability, identity controls, representative directional remapping,
alpha preservation and transparent hidden RGB. The desktop/mobile browser
acceptance covers enabled menu activation, accessible wavelength/angle
controls, representative pixel output, undo, local reload, project
import/export and immutable source-asset retention. These checks run in both
Playwright projects (`desktop` and `mobile`).

Wave is a local sinusoidal primitive. Displace maps, Polar Coordinates,
Spherize, Shear, ZigZag, mesh interpolation, GPU acceleration and Photoshop
algorithm parity remain separate roadmap items.
