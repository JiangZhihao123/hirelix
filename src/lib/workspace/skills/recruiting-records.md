# Recruiting records

Use for candidate/JD intake, matching, and dated client/candidate communications. Choose tools based on the request and their actual results; these guidelines are not a required sequence.

## Sources and identities

- Read files before interpreting them. Preserve original CV and JD attachments and each client's source separately. For authorized CV intake, use import_candidates; it reads the original and returns extracted facts plus actual saved candidates or unresolved identity conflicts. Do not separately extract the same CV first unless the current task needs an analysis before saving. Do not add a second profile because a duplicate needs clarification. Reuse an existing candidate only when identity evidence supports it.
- A bare upload needs one short question about its intended use unless the user has already delegated a clear task. Analysis-only requests do not authorize saving. For an explicitly requested preview, show the proposal without saving; a later approval should lead to normal tools using the established context.
- For a JD, save the original JD text/file separately from client call notes. Put each client's information on its own role. Never substitute a similar vacancy for a missing client-role identity. Client requirements update the current brief while preserving all still-valid JD requirements and unresolved questions. Supply the complete brief with priorities, flexible and unknowns explicitly; null means no brief change. Pair the update with its new scoped feedback or reuse the observed feedback_record_id for an already saved event. Do not duplicate a communication merely to revise the brief. Never overwrite the original JD.
- When saving an event from an uploaded client/candidate note, attach its original file_id to the saved record (or feedback.file_id when updating a role). A later user approval authorizes the write; it does not replace the uploaded document as the factual source. Preserve the original file and actual event time even if the record summarizes the text.
- Before a correction read the current object and version. Change only the requested facts, preserving unmentioned information. A new conversation is a new event; a correction updates the exact earlier event rather than adding a duplicate.

## Dates and private facts

- Resolve relative dates against request_time and the user's timezone. Preserve a date-only event with occurred_on and no invented time; a known exact time uses occurred_at with its timezone. A future appointment is planned, never completed activity.
- Candidate profiles hold professional facts. Calls, private preferences, compensation and client feedback belong in source records. Keep internal-only restrictions with the facts and carry them into any later drafting instructions.
- Sharing permission, interest and availability are separate facts. Permission is candidate-and-role-specific; unknown or unasked is not refused. A reported permission decision needs its own scoped evidence. For a call containing permission and other facts, retain a separate dated call record for the other facts so later reports can use the event accurately.
- For known dates in a correction, fix conflicting dates in the title/content too, preserving other facts and associations.

## Matching

Find the requested candidates and roles, then read relevant original/current evidence. Use specific professional experience and role requirements, not name prestige, keyword overlap or protected traits. Explain the strongest evidence, material risks, essential unknowns and the scope actually searched, without repeating the full CV or all saved-result cards. City of residence alone does not confirm office attendance, and professional experience alone does not confirm interest, availability or sharing permission. No suitable match is a valid result. Do not invent a vacancy or a global good/bad-candidate label. A request to compare does not require a saved document.
