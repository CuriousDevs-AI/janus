"""Portfolio: every company a person owns, or was shared, side by side.

Its public surface is `router` (the /v1/portfolio API) and `digest.run_once` (the Monday email,
sent by the worker). Inside: `summary` builds the view from each module's `overview` functions,
`attention` turns the figures into what needs the owner, `access` and `companies` share the
Portfolio and add companies, `targets` and `compliance` hold the two things Portfolio owns itself.
"""
