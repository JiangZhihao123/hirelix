# Agent file sandbox

Build the image on the worker host before enabling file tools:

```sh
docker build -t hirelix-agent-sandbox:1 deploy/agent-sandbox
```

The worker needs access to a Docker daemon whose local volume driver can mount
`tmpfs`. Docker/Colima and the image must be prepared on that host; the tools do
not pull images or fall back to host execution. The image includes Node.js,
Python, common spreadsheet and document libraries, and the workspace helper.
Image building needs package registry access; executed commands have no network.

For this machine's local QA profile, set `DOCKER_CONTEXT=colima-hirelix-qa`
in the worker/runtime process environment. This selects its daemon without
changing the user's globally selected Docker context. The QA image must be
built in that context as well.

Each execution lease has an isolated 128 MiB workspace. A keeper maintains the
memory-backed volume while individual commands run in separate containers.
Inputs are copied from the owner's private files to a separate read-only volume.
The containers receive no host directories, Docker socket, or application
credentials. They run as a non-root user with dropped capabilities, Docker's
default security profile, a read-only root filesystem, and CPU, memory, process,
file, workspace, and time limits. Docker on Linux shares the host kernel; the
security of the daemon, kernel, and deployment host remains part of the boundary.

The runtime must call `cleanupFileWorkspace` for the same lease after use,
including on interruption. When the worker is forcibly killed and cannot run
cleanup, commands still have a 60-second limit, input keepers stop after 10
minutes, and workspace keepers stop after two hours; stopping the last holder
releases the `tmpfs` contents. Stopped container and volume metadata can remain
and need operational cleanup after confirming the associated lease is no longer
active. A restarted Docker daemon or expired keeper loses the temporary files;
owned outputs already saved to `hirelix_private_files` remain available.
