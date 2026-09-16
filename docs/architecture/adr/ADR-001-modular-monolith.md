# ADR-001: Domain-oriented modular monolith

## Status

Accepted

## Context

The platform must eventually support Identity, Organization, People, Workforce, Attendance,
Leave, Payroll, Recruitment, Performance, Cases, Assets, Documents, Events, Configuration, and
Audit domains, deployed on Vercel Hobby + MongoDB Atlas Free Tier (AGENTS.md §45).

## Decision

Single Next.js application. Business logic is organized into `src/domains/<domain>` folders with
clear ownership boundaries, but all domains run in the same process and deploy as one unit. No
microservices, no message broker.

## Consequences

- Domain boundaries are enforced by folder structure and code review discipline, not by network
  boundaries — cheaper to get wrong and cheaper to fix than a premature service split.
- A domain can be extracted into its own service later if a concrete scaling or ownership
  requirement emerges, because the boundary already exists in the code.
- Cross-domain reads (e.g. the organization service querying `RoleAssignment` to scope "my
  organizations") go through models directly rather than an internal RPC layer, since everything
  is one process.
