;; SPDX-License-Identifier: LicenseRef-Zest-Proprietary
;; Extensions are long-lived contracts the executor-dao trusts.
(define-trait extension-trait (
  (callback (principal (buff 34)) (response bool uint))
))
