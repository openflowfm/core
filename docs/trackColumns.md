# `trackColumns.ts`

Live stores group membership as a parent link per track and
allows groups inside groups, so this walks the link rather than inferring structure
from track order. `buildColumns` gives every group a column of its own — a group track
is a real track with real clip slots — and collapsing drops its *descendants* at any
depth while the group's own column stays. That's Live's own behaviour, and it's why
there's no "stands in for its members" column kind: the thing that stands in for them
is the group itself.

Both column kinds carry `group`, meaning the same thing in both: the group whose color
band the column sits in. For a member that's its parent; for a group track it's itself,
because a group heads its own band. `startsBand` marks where a run begins, so the grid
can cap the left end and two adjacent groups never read as one. Only the immediate
parent is shown, so a group inside another opens a run in its own color rather than
continuing its parent's. Cyclic parent links are guarded against rather than trusted,
since a malformed one would hang the render.
