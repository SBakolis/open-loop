export const LOOP_HELP = `open-loop commands:
/loop until [options] -- <goal>
/loop every <duration> [options] -- <instruction>
/loop <duration> [options] -- <instruction>
/loop dynamic [options] -- <instruction>
/loop status [id] | pause [id] | resume [id] | run [id] | stop [id] | stop --all
/loop steer <id> -- <instruction> | clear | help

Options: --max-runs N, --max-age DURATION, --min-delay DURATION, --verify "COMMAND",
--completion agent|command|hybrid, --once, --no-persist, --allow-overlap, --abort`;
