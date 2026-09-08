# 2026-09-08-the-username-floor-is-four

`MIN_USERNAME_LENGTH` in `core/username.ts` was five and is now four. Nothing
else changed: both the normaliser and `usernameProblem` read the constant, the
tests express themselves in terms of it, and the app's hint under the field
interpolates it, so the number is stated once and every layer moved with it.

The floor exists for the reason Telegram's does, which the file still carries:
short names are a fixed and tiny supply against an unbounded supply of longer
ones, and without a floor they go to whoever signs up first and never comes
back. That argument settles *that* there is a floor and says nothing about
where it sits. Five was taken from Telegram along with the argument. Four keeps
the scarce end reserved — one, two and three characters are together some
quarter of a million names — while admitting the roughly fifteen million of
four, which is not a supply worth rationing at this size and does include a lot
of ordinary short names people actually answer to.

**The move is one-way, and that is the whole reason it was safe to make.**
Raising a floor takes names off people already holding them, so this cannot be
undone once anybody registers a four-character name; lowering one only ever
admits names nobody has yet. The cheap moment to lower it was before there was
a population, which is where this still is.
