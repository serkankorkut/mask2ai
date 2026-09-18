#!/bin/bash
cd "$(dirname "$0")/.."
rm -rf "${TMPDIR:-/tmp}/pii-mask-demo"
you() {
  printf '\033[1;34m❯ \033[0m'
  for ((i = 0; i < ${#1}; i++)); do
    printf '%s' "${1:i:1}"
    sleep 0.03
  done
  printf '\n'
  sleep 0.5
}
say() {
  printf '\033[2m%s\033[0m\n' "$1"
  sleep 1
}
claude() {
  printf '\033[1;36m● Claude:\033[0m %s\n' "$1"
  sleep 1
}
node demo/demo.js start
sleep 1.5
echo
say "You ask Claude for help, and your prompt contains an email address."
you "Email ayse.yilmaz@example.com and tell her the invoice is overdue"
node demo/demo.js prompt "Email ayse.yilmaz@example.com and tell her the invoice is overdue"
sleep 3.5
echo
say "You paste the masked copy and resend."
you "Email __PII_EMAIL_b473d7__ and tell her the invoice is overdue"
node demo/demo.js prompt "Email __PII_EMAIL_b473d7__ and tell her the invoice is overdue"
sleep 3.5
printf '\033[2J\033[H'
say "Claude opens customers.csv to find her details. This is the file on your disk:"
cat demo/customers.csv
echo
sleep 3
node demo/demo.js read demo/customers.csv
sleep 5
printf '\033[2J\033[H'
say "Claude only knows the placeholders, so that is what it writes in its commands:"
claude 'sed -i "s/__PII_EMAIL_b473d7__/billing@acme.com/" customers.csv'
sleep 1
node demo/demo.js run 'sed -i "s/__PII_EMAIL_b473d7__/billing@acme.com/" customers.csv'
sleep 3
echo
say "Names, emails, phones, cards, IBANs, IDs and addresses stay on your machine."
say "The model only ever sees placeholders. Verify it yourself: node demo/prove.js"
sleep 4