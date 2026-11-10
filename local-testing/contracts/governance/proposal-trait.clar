;; SPDX-License-Identifier: LicenseRef-Zest-Proprietary
;; Proposals are one-shot governance actions executed by the executor-dao.
(define-trait proposal-trait (
  (execute (principal) (response bool uint))
))
