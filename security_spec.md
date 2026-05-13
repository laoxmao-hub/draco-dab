# Security Specification: StockMaster

## 1. Data Invariants
- An `Item` must have an `ownerId` matching the authenticated user's UID.
- An `Item`'s `quantity` must be non-negative.
- `createdAt` and `updatedAt` field must be valid server timestamps.
- `User` profiles can only be created/updated by the user themselves.

## 2. The "Dirty Dozen" Payloads

| ID | Action | Collection | Description | Expected |
|----|--------|------------|-------------|----------|
| 1 | Create | items | No ownerId provided | DENY |
| 2 | Create | items | ownerId doesn't match auth.uid | DENY |
| 3 | Create | items | Negative quantity | DENY |
| 4 | Update | items | Updating ownerId (immutability) | DENY |
| 5 | Update | items | Updating createdAt (immutability) | DENY |
| 6 | Get | items | Accessing item belonging to another user | DENY |
| 7 | List | items | Listing all items without owner filter | DENY |
| 8 | Create | items | Excessively long name (> 1000 chars) | DENY |
| 9 | Update | items | Injecting unknown fields (Shadow Update) | DENY |
| 10 | Create | users | Creating profile for another UID | DENY |
| 11 | Update | users | Modifying email to one already in use (though auth handles this, rules should too) | DENY |
| 12 | Create | items | Using a string instead of a number for price | DENY |

## 3. Test Runner (Mock)
A `firestore.rules.test.ts` would verify these constraints using the Firebase Security Rules Emulator.
