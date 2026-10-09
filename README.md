# README Clew 2

Checks whether your README matches your code. A Chrome extension and web page for any public JavaScript or TypeScript repo on GitHub.

Rules and five deterministic verifiers decide what's true. Jev labels README lines with calibrated confidence. Haiku explains the findings.

**Status:** in progress for the AdaL "What Would Jev Do?" hackathon (Oct 6 to 11, 2026). The full README, with setup steps and honest limitations, lands before submission.

## Credits

### How we use Jev

Swift (Major League Hacking), ["I got Jev to zero mistakes. I'm still using Flash-Lite."](https://dev.to/theycallmeswift/i-got-jev-to-zero-mistakes-im-still-using-flash-lite-2mo7), DEV Community, October 8, 2026.

MLH measured Jev on a routing job close to ours: deciding which deterministic checker can verify a plain-English claim. Their findings shaped how README Clew 2 asks Jev questions and when it trusts the answers:

- **The two mistakes aren't equal.** Marking a line Unverifiable costs a little coverage. Sending a line to the wrong verifier can produce a false "Contradicted," which costs your trust. So when Jev isn't sure, README Clew 2 says "can't tell."
- **Describe the verifier, not the line.** Jev answers the question you wrote, literally. Our label criteria describe what each verifier checks and what it can't see, instead of what a README line looks like.
- **One test question.** "Imagine the verifier finds this name in the code. Would that prove this line is a true claim about this repo?" If not, the line isn't sent to a verifier.
- **No worked examples in Jev's criteria.** In MLH's tests, adding examples made Jev's dangerous mistakes worse.
- **Count mistakes per line, not per run.** Jev's errors tend to repeat on the same line, which a better question can fix.
- **A 0.8 confidence bar** is our starting point for the confidence gate, set on half our test lines and checked on the other half.

---

AI assisted. Human approved. Powered by NLP.
