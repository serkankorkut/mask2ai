#!/bin/bash
cd "$(dirname "$0")/.."
rm -rf "${TMPDIR:-/tmp}/pii-mask-demo"
type_cmd() {
  printf '\033[1;34m❯\033[0m '
  for ((i = 0; i < ${#1}; i++)); do
    printf '%s' "${1:i:1}"
    sleep 0.03
  done
  printf '\n'
  sleep 0.4
}
comment() {
  printf '\033[2m# %s\033[0m\n' "$1"
  sleep 0.8
}
type_cmd "cat demo/customers.csv"
cat demo/customers.csv
sleep 2.5
echo
comment "what the model receives from that tool call"
type_cmd "node demo/demo.js tool demo/customers.csv"
node demo/demo.js tool demo/customers.csv
sleep 4.5
printf '\033[2J\033[H'
comment "a prompt with personal data never leaves the machine"
type_cmd 'node demo/demo.js prompt "Email ayse.yilmaz@example.com, card 4111 1111 1111 1111 was declined"'
node demo/demo.js prompt "Email ayse.yilmaz@example.com, card 4111 1111 1111 1111 was declined"
sleep 4.5
echo
comment "placeholders are restored when Claude edits files or runs commands"
type_cmd 'node demo/demo.js edit "sed -i s/__PII_EMAIL_b473d7__/support@acme.com/ customers.csv"'
node demo/demo.js edit "sed -i s/__PII_EMAIL_b473d7__/support@acme.com/ customers.csv"
sleep 4