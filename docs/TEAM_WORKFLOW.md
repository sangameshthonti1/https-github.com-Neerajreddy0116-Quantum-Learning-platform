# Quantum Learning Platform — Team Workflow

## Project goal
Build a working AI-based interactive quantum algorithm learning platform for SIH 2026.

## Source of truth
GitHub is the permanent source of truth. All teammates work in the same repository. No laptop is the master machine.

## Team structure
The number of laptops may change. Work is assigned by feature, not by laptop. Each task has one owner and may have supporting members.

## Branch rules
- main contains the latest integrated, working version.
- Every feature or setup task uses a separate branch.
- Do not directly commit experimental work to main.
- Merge changes through a pull request after review and testing.
- Do not force-push or delete another teammate's work.

## Before starting a task
1. Read the relevant project specifications and API contracts.
2. Confirm the task owner and the files or module being changed.
3. Create or switch to the assigned feature branch.
4. Tell the AI agent to follow the shared contracts.
5. Define how the feature will be tested.

## While working
- Commit small, working changes.
- Do not independently change shared API contracts.
- Do not overwrite another teammate's module without coordination.
- Never commit passwords, API keys, .env files, or other secrets.
- Use mock data only when clearly identified as mock data.

## Integration
Frontend and backend communicate through agreed API contracts.
A feature is complete only when it has been tested and can be integrated.
The team integrates frequently instead of waiting until the end.

## Communication
Each task update should contain:
Owner:
Task:
Branch:
Status:
What works:
Blocker:
Next action:

## Definition of done
A task is done when its acceptance criteria are met, relevant tests pass, and the changes are ready for review. A visual feature is not considered functional merely because it looks complete.

## New laptop onboarding
A new teammate obtains repository access, clones the same repository, reads this document, installs the documented dependencies, and works on an assigned branch. No separate project or repository is created.
