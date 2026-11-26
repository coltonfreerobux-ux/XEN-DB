# District Desk

A responsive, dependency-free front-end prototype for district administration workflows.

## Included workflows

- One-time owner setup and sign-in.
- District admin applications; the owner can approve or deny requests.
- Approved district admins can sign in and create staff accounts with assigned roles.
- Role-based tasks and staff task completion.
- Admin-created service forms that appear to matching staff roles; submissions become tasks for the service's target roles.

## Run it

Open `index.html` in a modern browser, or serve this folder with any static web server. The first screen lets you set up the demo owner account. Use a second browser session to test another account in the same browser profile.

## Important security and deployment note

This repository started as an empty static site, so this implementation is a **single-browser demo**, not a production authentication or multi-user system. Accounts, approvals, roles, and work items live in browser `localStorage`; they are not sent to an owner over the internet and are not shared across devices. Passwords are PBKDF2-hashed in the browser, but client-side storage and authorization can be inspected or changed by the browser user. Do not use real credentials or sensitive information. A production deployment needs a trusted backend, server-side authorization, a database, and a secure identity provider; the owner approval and staff provisioning actions must be enforced server-side.

To reset the demo, clear this site's local storage and session storage in your browser.
