# Dependency patches

Store only reviewed, temporary upstream dependency fixes here. Do not put Nexa business logic in dependency patches.

With pnpm, create a patch using `pnpm patch <package>@<version>`, edit the extracted package, then run `pnpm patch-commit <directory>`. pnpm records the patch path in the root workspace configuration. Remove the patch when an upstream release contains the fix.

There are no dependency patches yet.
